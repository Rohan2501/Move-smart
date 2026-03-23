import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { WebSocketServer, WebSocket } from "ws";
import http from "http";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new Database("movesmart.db");

// Initialize database
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE,
    password TEXT,
    name TEXT,
    phone TEXT,
    role TEXT DEFAULT 'user'
  );
`);

// Ensure role column exists for existing databases
try {
  db.exec("ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user'");
} catch (e) {
  // Column might already exist
}

db.exec(`
  CREATE TABLE IF NOT EXISTS bookings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    vehicle_type TEXT,
    pickup_address TEXT,
    dropoff_address TEXT,
    estimated_price REAL,
    distance REAL,
    status TEXT DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    booking_id INTEGER,
    title TEXT,
    message TEXT,
    type TEXT,
    is_read INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id),
    FOREIGN KEY(booking_id) REFERENCES bookings(id)
  );

  CREATE TABLE IF NOT EXISTS favorites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    label TEXT,
    address TEXT,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );
`);

async function startServer() {
  const app = express();
  const server = http.createServer(app);
  const wss = new WebSocketServer({ server });
  const PORT = 3000;

  const clients = new Map<number, WebSocket>();

  wss.on('connection', (ws) => {
    ws.on('message', (message) => {
      try {
        const data = JSON.parse(message.toString());
        if (data.type === 'auth') {
          clients.set(data.userId, ws);
        }
      } catch (e) {
        console.error("WS message error", e);
      }
    });

    ws.on('close', () => {
      for (const [userId, client] of clients.entries()) {
        if (client === ws) {
          clients.delete(userId);
          break;
        }
      }
    });
  });

  function sendNotification(userId: number, title: string, message: string, type: string, bookingId?: number | bigint) {
    try {
      const stmt = db.prepare("INSERT INTO notifications (user_id, booking_id, title, message, type) VALUES (?, ?, ?, ?, ?)");
      const result = stmt.run(userId, bookingId || null, title, message, type);
      
      const notification = {
        id: result.lastInsertRowid,
        user_id: userId,
        booking_id: bookingId || null,
        title,
        message,
        type,
        is_read: 0,
        created_at: new Date().toISOString()
      };

      const client = clients.get(userId);
      if (client && client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({ type: 'notification', data: notification }));
      }
    } catch (e) {
      console.error("Failed to send notification", e);
    }
  }

  app.use(express.json());

  // Auth Routes
  app.post("/api/auth/signup", (req, res) => {
    const { email, password, role } = req.body;
    try {
      const userCount = (db.prepare("SELECT COUNT(*) as count FROM users").get() as any).count;
      const assignedRole = userCount === 0 ? 'admin' : (role || 'user');
      
      const stmt = db.prepare("INSERT INTO users (email, password, role) VALUES (?, ?, ?)");
      const result = stmt.run(email, password, assignedRole);
      res.json({ success: true, userId: result.lastInsertRowid });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.post("/api/auth/login", (req, res) => {
    const { email, password } = req.body;
    const user = db.prepare("SELECT * FROM users WHERE email = ? AND password = ?").get(email, password) as any;
    if (user) {
      res.json({ success: true, user: { id: user.id, email: user.email, name: user.name, phone: user.phone, role: user.role } });
    } else {
      res.status(401).json({ error: "Invalid credentials" });
    }
  });

  // Admin Middleware
  const isAdmin = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const userId = req.headers['x-user-id'];
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    
    const user = db.prepare("SELECT role FROM users WHERE id = ?").get(userId) as any;
    if (user && user.role === 'admin') {
      next();
    } else {
      res.status(403).json({ error: "Forbidden: Admin access required" });
    }
  };

  // Admin Routes
  app.get("/api/admin/bookings", isAdmin, (req, res) => {
    const bookings = db.prepare(`
      SELECT b.*, u.email as user_email, u.name as user_name 
      FROM bookings b 
      JOIN users u ON b.user_id = u.id 
      ORDER BY b.created_at DESC
    `).all();
    res.json(bookings);
  });

  app.get("/api/admin/users", isAdmin, (req, res) => {
    const users = db.prepare("SELECT id, email, name, phone, role FROM users").all();
    res.json(users);
  });

  app.put("/api/admin/users/:id/role", isAdmin, (req, res) => {
    const { role } = req.body;
    try {
      db.prepare("UPDATE users SET role = ? WHERE id = ?").run(role, req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // User Profile Routes
  app.get("/api/user/:id", (req, res) => {
    const user = db.prepare("SELECT id, email, name, phone FROM users WHERE id = ?").get(req.params.id) as any;
    if (user) {
      res.json(user);
    } else {
      res.status(404).json({ error: "User not found" });
    }
  });

  app.put("/api/user/:id", (req, res) => {
    const { name, phone } = req.body;
    try {
      db.prepare("UPDATE users SET name = ?, phone = ? WHERE id = ?").run(name, phone, req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.put("/api/user/:id/password", (req, res) => {
    const { currentPassword, newPassword } = req.body;
    try {
      const user = db.prepare("SELECT * FROM users WHERE id = ? AND password = ?").get(req.params.id, currentPassword);
      if (!user) {
        return res.status(401).json({ error: "Incorrect current password" });
      }
      db.prepare("UPDATE users SET password = ? WHERE id = ?").run(newPassword, req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.delete("/api/user/:id", (req, res) => {
    try {
      db.prepare("DELETE FROM users WHERE id = ?").run(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Booking Routes
  app.post("/api/create-payment-intent", async (req, res) => {
    const { amount } = req.body;
    try {
      const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
      if (!stripeSecretKey) {
        throw new Error('Stripe secret key is not configured.');
      }
      
      const stripe = new (await import('stripe')).default(stripeSecretKey);
      
      const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(amount * 100), // Convert to cents
        currency: 'usd',
        automatic_payment_methods: {
          enabled: true,
        },
      });

      res.json({ clientSecret: paymentIntent.client_secret });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.post("/api/bookings", (req, res) => {
    const { userId, vehicleType, pickup, dropoff, price, distance } = req.body;
    try {
      const stmt = db.prepare("INSERT INTO bookings (user_id, vehicle_type, pickup_address, dropoff_address, estimated_price, distance, status) VALUES (?, ?, ?, ?, ?, ?, ?)");
      const result = stmt.run(userId, vehicleType, pickup, dropoff, price, distance, 'confirmed');
      const bookingId = result.lastInsertRowid;

      sendNotification(userId, "Booking Confirmed", `Your booking for a ${vehicleType} from ${pickup} is confirmed!`, "booking_confirmed", bookingId);

      // Simulate status changes
      const statuses = [
        { status: 'driver_assigned', title: 'Driver Assigned', message: 'A driver has been assigned to your order.' },
        { status: 'en_route', title: 'En Route', message: 'Your driver is on the way to the pickup location.' },
        { status: 'picked_up', title: 'Goods Picked Up', message: 'Your goods have been picked up and are on the way.' },
        { status: 'delivered', title: 'Delivered', message: 'Your goods have been delivered successfully!' }
      ];

      statuses.forEach((s, index) => {
        setTimeout(() => {
          db.prepare("UPDATE bookings SET status = ? WHERE id = ?").run(s.status, bookingId);
          sendNotification(userId, s.title, s.message, s.status, bookingId);
        }, (index + 1) * 15000); // Every 15 seconds for demo
      });

      res.json({ success: true, bookingId });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.get("/api/bookings/:userId", (req, res) => {
    const bookings = db.prepare("SELECT * FROM bookings WHERE user_id = ? ORDER BY created_at DESC").all(req.params.userId);
    res.json(bookings);
  });

  // Notification Routes
  app.get("/api/notifications/:userId", (req, res) => {
    const notifications = db.prepare("SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50").all(req.params.userId);
    res.json(notifications);
  });

  app.post("/api/notifications/:id/read", (req, res) => {
    try {
      db.prepare("UPDATE notifications SET is_read = 1 WHERE id = ?").run(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Favorite Routes
  app.get("/api/favorites/:userId", (req, res) => {
    const favorites = db.prepare("SELECT * FROM favorites WHERE user_id = ?").all(req.params.userId);
    res.json(favorites);
  });

  app.post("/api/favorites", (req, res) => {
    const { userId, label, address } = req.body;
    try {
      const stmt = db.prepare("INSERT INTO favorites (user_id, label, address) VALUES (?, ?, ?)");
      const result = stmt.run(userId, label, address);
      res.json({ success: true, id: result.lastInsertRowid });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.delete("/api/favorites/:id", (req, res) => {
    try {
      db.prepare("DELETE FROM favorites WHERE id = ?").run(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
