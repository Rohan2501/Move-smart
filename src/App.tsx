import React, { useState, useEffect, useRef } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { 
  Bike, 
  Truck, 
  Home, 
  MapPin, 
  Navigation, 
  Clock, 
  ChevronRight, 
  LogOut, 
  User as UserIcon,
  Package,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  Car,
  Box,
  Bell,
  Lock,
  Phone,
  Mail,
  Save,
  Star,
  Trash2,
  Search,
  Map as MapIcon,
  X
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { MapContainer, TileLayer, Marker, Popup, useMap, Polyline } from 'react-leaflet';
import L from 'leaflet';
import { VEHICLES, Vehicle, User, Booking, Notification, Favorite, MapSearchResult } from './types';

// Initialize Stripe
const stripePromise = loadStripe((import.meta as any).env.VITE_STRIPE_PUBLISHABLE_KEY || '');

// Fix Leaflet marker icons
// @ts-ignore
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

function ChangeView({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, 13);
  }, [center, map]);
  return null;
}

function MapUpdater({ pickup, dropoff }: { pickup: [number, number] | null, dropoff: [number, number] | null }) {
  const map = useMap();
  useEffect(() => {
    if (pickup && dropoff) {
      const bounds = L.latLngBounds([pickup, dropoff]);
      map.fitBounds(bounds, { padding: [50, 50] });
    } else if (pickup) {
      map.setView(pickup, 13);
    } else if (dropoff) {
      map.setView(dropoff, 13);
    }
  }, [pickup, dropoff, map]);
  return null;
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [view, setView] = useState<'landing' | 'login' | 'signup' | 'dashboard' | 'bookings' | 'profile' | 'admin'>('landing');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Booking state
  const [pickup, setPickup] = useState('');
  const [pickupCoords, setPickupCoords] = useState<[number, number] | null>(null);
  const [dropoff, setDropoff] = useState('');
  const [dropoffCoords, setDropoffCoords] = useState<[number, number] | null>(null);
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);
  const [vehicleFilter, setVehicleFilter] = useState<'all' | 'bike' | 'truck' | 'van' | 'other'>('all');
  const [distance, setDistance] = useState<number>(0); 
  const [estimatedPrice, setEstimatedPrice] = useState<number>(0);
  const [bookingSuccess, setBookingSuccess] = useState(false);
  const [userBookings, setUserBookings] = useState<Booking[]>([]);
  const [bookingTab, setBookingTab] = useState<'current' | 'past'>('current');
  const [locating, setLocating] = useState(false);
  const [trafficStatus, setTrafficStatus] = useState<'Low' | 'Moderate' | 'Heavy' | 'Unknown'>('Unknown');
  const [trafficMultiplier, setTrafficMultiplier] = useState<number>(1);
  const [trackingBooking, setTrackingBooking] = useState<Booking | null>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [newNotificationToast, setNewNotificationToast] = useState<Notification | null>(null);
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [showFavoriteModal, setShowFavoriteModal] = useState<{ address: string, type: 'pickup' | 'dropoff' } | null>(null);
  const [showMapSearch, setShowMapSearch] = useState<boolean>(false);
  const [mapSearchQuery, setMapSearchQuery] = useState('');
  const [mapSearchResults, setMapSearchResults] = useState<MapSearchResult[]>([]);
  const [selectedMapLocation, setSelectedMapLocation] = useState<MapSearchResult | null>(null);
  const [searchingMap, setSearchingMap] = useState(false);
  const [favoriteLabel, setFavoriteLabel] = useState('');
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [adminBookings, setAdminBookings] = useState<(Booking & { user_email: string, user_name: string })[]>([]);
  const [adminUsers, setAdminUsers] = useState<User[]>([]);
  const [adminLoading, setAdminLoading] = useState(false);
  const isFirstRender = useRef(true);

  // Load draft on mount
  useEffect(() => {
    const savedDraft = localStorage.getItem('move_smart_booking_draft');
    if (savedDraft) {
      try {
        const draft = JSON.parse(savedDraft);
        if (draft.pickup) setPickup(draft.pickup);
        if (draft.dropoff) setDropoff(draft.dropoff);
        if (draft.vehicleId) {
          const vehicle = VEHICLES.find(v => v.id === draft.vehicleId);
          if (vehicle) setSelectedVehicle(vehicle);
        }
        if (draft.timestamp) setLastSaved(new Date(draft.timestamp));
      } catch (e) {
        console.error('Failed to parse saved draft', e);
      }
    }
  }, []);

  // Save draft on change (automatic) - Debounced to prevent typing lag
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    const timer = setTimeout(() => {
      if (pickup || dropoff || selectedVehicle) {
        const draft = {
          pickup,
          dropoff,
          vehicleId: selectedVehicle?.id,
          timestamp: new Date().toISOString()
        };
        localStorage.setItem('move_smart_booking_draft', JSON.stringify(draft));
        setLastSaved(new Date());
      } else {
        localStorage.removeItem('move_smart_booking_draft');
        setLastSaved(null);
      }
    }, 1000); // 1 second debounce for draft saving

    return () => clearTimeout(timer);
  }, [pickup, dropoff, selectedVehicle]);

  const saveDraftManually = () => {
    if (pickup || dropoff || selectedVehicle) {
      const draft = {
        pickup,
        dropoff,
        vehicleId: selectedVehicle?.id,
        timestamp: new Date().toISOString()
      };
      localStorage.setItem('move_smart_booking_draft', JSON.stringify(draft));
      setLastSaved(new Date());
    } else {
      localStorage.removeItem('move_smart_booking_draft');
      setLastSaved(null);
    }
  };

  const playNotificationSound = () => {
    const audio = new Audio('https://cdn.pixabay.com/audio/2022/03/15/audio_78390a2431.mp3');
    audio.volume = 0.4;
    audio.play().catch(e => console.log("Audio play blocked", e));
  };

  useEffect(() => {
    if (user) {
      // Connect to WebSocket
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${protocol}//${window.location.host}`);

      ws.onopen = () => {
        ws.send(JSON.stringify({ type: 'auth', userId: user.id }));
      };

      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === 'notification') {
          setNotifications(prev => [data.data, ...prev]);
          setNewNotificationToast(data.data);
          playNotificationSound();
          
          // If the notification is a status update for the currently tracked booking, update it
          if (trackingBooking && data.data.type !== 'booking_confirmed') {
            if (!data.data.booking_id || data.data.booking_id === trackingBooking.id) {
              setTrackingBooking(prev => prev ? { ...prev, status: data.data.type } : null);
            }
          }

          // Update the bookings list if we have a booking_id
          if (data.data.booking_id) {
            setUserBookings(prev => prev.map(b => 
              b.id === data.data.booking_id ? { ...b, status: data.data.type } : b
            ));
          }
          
          setTimeout(() => setNewNotificationToast(null), 5000);
        }
      };

      // Fetch initial notifications
      fetchNotifications();
      fetchFavorites();

      return () => ws.close();
    }
  }, [user, trackingBooking?.id]);

  const fetchNotifications = async () => {
    if (!user) return;
    try {
      const res = await fetch(`/api/notifications/${user.id}`);
      const data = await res.json();
      setNotifications(data);
    } catch (err) {
      console.error('Failed to fetch notifications');
    }
  };

  const fetchFavorites = async () => {
    if (!user) return;
    try {
      const res = await fetch(`/api/favorites/${user.id}`);
      const data = await res.json();
      setFavorites(data);
    } catch (err) {
      console.error('Failed to fetch favorites');
    }
  };

  const addFavorite = async () => {
    if (!user || !showFavoriteModal || !favoriteLabel) return;
    try {
      const res = await fetch('/api/favorites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          label: favoriteLabel,
          address: showFavoriteModal.address
        })
      });
      const data = await res.json();
      if (data.success) {
        setFavorites(prev => [...prev, { id: data.id, user_id: user.id, label: favoriteLabel, address: showFavoriteModal.address }]);
        setShowFavoriteModal(null);
        setFavoriteLabel('');
      }
    } catch (err) {
      console.error('Failed to add favorite');
    }
  };

  const removeFavorite = async (id: number) => {
    try {
      await fetch(`/api/favorites/${id}`, { method: 'DELETE' });
      setFavorites(prev => prev.filter(f => f.id !== id));
    } catch (err) {
      console.error('Failed to remove favorite');
    }
  };

  const markAsRead = async (id: number) => {
    try {
      await fetch(`/api/notifications/${id}/read`, { method: 'POST' });
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: 1 } : n));
    } catch (err) {
      console.error('Failed to mark notification as read');
    }
  };

  const clearAllNotifications = async () => {
    if (!user) return;
    try {
      // We'll just mark all as read for now as a "clear" action
      await Promise.all(notifications.filter(n => !n.is_read).map(n => markAsRead(n.id)));
      setNotifications([]); // Or keep them as read, but let's clear for the UI
    } catch (err) {
      console.error('Failed to clear notifications');
    }
  };

  const getTrafficEstimation = async (p: string, d: string) => {
    try {
      const { GoogleGenAI } = await import("@google/genai");
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
      
      const prompt = `Analyze the traffic between "${p}" and "${d}" at ${new Date().toLocaleTimeString()}. 
      Return a JSON object with:
      1. "status": one of "Low", "Moderate", "Heavy"
      2. "multiplier": a number between 1.0 and 2.0 (1.0 for Low, 1.3 for Moderate, 1.8 for Heavy)
      3. "reason": a short description of why (e.g. "Peak hour rush", "Clear roads")`;

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: { responseMimeType: "application/json" }
      });

      const data = JSON.parse(response.text || '{}');
      setTrafficStatus(data.status || 'Low');
      setTrafficMultiplier(data.multiplier || 1);
      return data;
    } catch (err) {
      console.error("Traffic estimation failed", err);
      setTrafficStatus('Low');
      setTrafficMultiplier(1);
    }
  };

  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by your browser');
      return;
    }

    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        const newPickup = `Current Location (${latitude.toFixed(4)}, ${longitude.toFixed(4)})`;
        setPickup(newPickup);
        setPickupCoords([latitude, longitude]);
        setLocating(false);
        if (dropoff) {
          calculateMockDistance(newPickup, dropoff);
          getTrafficEstimation(newPickup, dropoff);
        }
      },
      (err) => {
        setError('Unable to retrieve your location');
        setLocating(false);
      }
    );
  };

  const calculateMockDistance = (p: string, d: string) => {
    if (!p || !d) return;
    const base = (p.length + d.length) % 15;
    const mockDist = Math.max(2, base + Math.floor(Math.random() * 5));
    setDistance(mockDist);
  };

  // Debounced distance and traffic estimation
  useEffect(() => {
    const timer = setTimeout(() => {
      if (pickup && dropoff) {
        calculateMockDistance(pickup, dropoff);
        getTrafficEstimation(pickup, dropoff);
      }
    }, 1500); // 1.5 second debounce for expensive traffic API calls

    return () => clearTimeout(timer);
  }, [pickup, dropoff]);

  useEffect(() => {
    if (selectedVehicle && distance > 0) {
      // Simple estimation logic: (basePrice + (distance * multiplier)) * trafficMultiplier
      const multiplier = selectedVehicle.id === 'packers-movers' ? 50 : 15;
      const baseFare = selectedVehicle.basePrice + (distance * multiplier);
      setEstimatedPrice(Math.round(baseFare * trafficMultiplier));
    }
  }, [selectedVehicle, distance, trafficMultiplier]);

  const handleAuth = async (type: 'login' | 'signup') => {
    setError('');
    setLoading(true);
    try {
      const res = await fetch(`/api/auth/${type}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();
      if (data.success) {
        if (type === 'signup') {
          setView('login');
          setError('Account created! Please login.');
        } else {
          setUser(data.user);
          setView('dashboard');
        }
      } else {
        setError(data.error || 'Authentication failed');
      }
    } catch (err) {
      setError('Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const fetchAdminData = async () => {
    if (!user || user.role !== 'admin') return;
    setAdminLoading(true);
    try {
      const [bookingsRes, usersRes] = await Promise.all([
        fetch('/api/admin/bookings', { headers: { 'x-user-id': user.id.toString() } }),
        fetch('/api/admin/users', { headers: { 'x-user-id': user.id.toString() } })
      ]);
      const bookingsData = await bookingsRes.json();
      const usersData = await usersRes.json();
      setAdminBookings(bookingsData);
      setAdminUsers(usersData);
    } catch (err) {
      console.error('Failed to fetch admin data');
    } finally {
      setAdminLoading(false);
    }
  };

  const updateUserRole = async (userId: number, newRole: string) => {
    if (!user || user.role !== 'admin') return;
    try {
      const res = await fetch(`/api/admin/users/${userId}/role`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'x-user-id': user.id.toString()
        },
        body: JSON.stringify({ role: newRole })
      });
      const data = await res.json();
      if (data.success) {
        setAdminUsers(prev => prev.map(u => u.id === userId ? { ...u, role: newRole as any } : u));
      }
    } catch (err) {
      console.error('Failed to update user role');
    }
  };

  const fetchBookings = async () => {
    if (!user) return;
    try {
      const res = await fetch(`/api/bookings/${user.id}`);
      const data = await res.json();
      setUserBookings(data);
    } catch (err) {
      console.error('Failed to fetch bookings');
    }
  };

  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [clientSecret, setClientSecret] = useState('');

  const handleBooking = async () => {
    if (!user || !selectedVehicle || !pickup || !dropoff) return;
    setLoading(true);
    try {
      const res = await fetch('/api/create-payment-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: estimatedPrice })
      });
      const data = await res.json();
      if (data.clientSecret) {
        setClientSecret(data.clientSecret);
        setShowPaymentModal(true);
      } else {
        setError('Failed to initialize payment');
      }
    } catch (err) {
      setError('Payment initialization failed');
    } finally {
      setLoading(false);
    }
  };

  const confirmBookingAfterPayment = async () => {
    if (!user || !selectedVehicle || !pickup || !dropoff) return;
    setLoading(true);
    try {
      const res = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          vehicleType: selectedVehicle.name,
          pickup,
          dropoff,
          price: estimatedPrice,
          distance: distance || 0
        })
      });
      const data = await res.json();
      if (data.success) {
        const newBooking = {
          id: data.bookingId,
          user_id: user.id,
          vehicle_type: selectedVehicle.name,
          pickup_address: pickup,
          dropoff_address: dropoff,
          estimated_price: estimatedPrice,
          distance: distance || 0,
          status: 'pending',
          created_at: new Date().toISOString()
        };
        setShowPaymentModal(false);
        setBookingSuccess(true);
        localStorage.removeItem('move_smart_booking_draft');
        setLastSaved(null);
        setTimeout(() => {
          setBookingSuccess(false);
          setTrackingBooking(newBooking);
          setView('dashboard'); // We'll show tracking overlay on dashboard or a new view
        }, 2000);
      }
    } catch (err) {
      setError('Booking failed');
    } finally {
      setLoading(false);
    }
  };

  const PaymentForm = () => {
    const stripe = useStripe();
    const elements = useElements();
    const [paymentError, setPaymentError] = useState('');
    const [processing, setProcessing] = useState(false);

    const handleSubmit = async (event: React.FormEvent) => {
      event.preventDefault();

      if (!stripe || !elements) {
        return;
      }

      setProcessing(true);

      const cardElement = elements.getElement(CardElement);
      if (!cardElement) return;

      const result = await stripe.confirmCardPayment(clientSecret, {
        payment_method: {
          card: cardElement as any,
          billing_details: {
            name: user?.name,
            email: user?.email,
          },
        }
      });

      if (result.error) {
        setPaymentError(result.error.message || 'Payment failed');
        setProcessing(false);
      } else {
        if (result.paymentIntent.status === 'succeeded') {
          confirmBookingAfterPayment();
        }
      }
    };

    return (
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="p-4 bg-gray-50 rounded-xl border border-gray-200">
          <CardElement options={{
            style: {
              base: {
                fontSize: '16px',
                color: '#424770',
                '::placeholder': {
                  color: '#aab7c4',
                },
              },
              invalid: {
                color: '#9e2146',
              },
            },
          }} />
        </div>
        {paymentError && <div className="text-red-500 text-sm">{paymentError}</div>}
        <button
          type="submit"
          disabled={!stripe || processing}
          className="w-full py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-colors disabled:opacity-50"
        >
          {processing ? 'Processing...' : `Pay ₹${estimatedPrice}`}
        </button>
      </form>
    );
  };

  const LiveTracking = ({ booking, onBack }: { booking: Booking, onBack: () => void }) => {
    const [progress, setProgress] = useState(0);
    const [currentTime, setCurrentTime] = useState(new Date());

    const getDynamicStatusText = (status: string, currentProgress: number) => {
      const s = status.toLowerCase();
      if (s === 'confirmed') return 'Booking Confirmed';
      if (s === 'driver_assigned') {
        if (currentProgress < 15) return 'Driver Assigned';
        return 'Driver preparing for pickup';
      }
      if (s === 'en_route') {
        if (currentProgress < 20) return 'Driver En Route';
        if (currentProgress < 40) return 'Driver nearby';
        return 'Arriving at pickup';
      }
      if (s === 'picked_up') {
        if (currentProgress < 60) return 'Goods Picked Up';
        if (currentProgress < 80) return 'On the way to destination';
        if (currentProgress < 95) return 'Almost there';
        return 'Arriving at destination';
      }
      if (s === 'delivered') return 'Delivered';
      return status.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
    };

    const statusText = getDynamicStatusText(booking.status, progress);

    // Sync progress with server status
    useEffect(() => {
      switch (booking.status) {
        case 'confirmed': setProgress(0); break;
        case 'driver_assigned': setProgress(10); break;
        case 'en_route': setProgress(30); break;
        case 'picked_up': setProgress(50); break;
        case 'delivered': setProgress(100); break;
        default: break;
      }
    }, [booking.status]);

    // Calculate ETA based on distance
    const totalTime = (booking.distance || 3) * 5; 
    const minsRemaining = Math.max(0, Math.ceil(totalTime * (1 - progress / 100)));
    
    const arrivalTime = new Date(currentTime.getTime() + minsRemaining * 60000);
    const arrivalTimeString = arrivalTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    useEffect(() => {
      const timer = setInterval(() => setCurrentTime(new Date()), 1000);
      return () => clearInterval(timer);
    }, []);

    // Smooth progress animation if not delivered
    useEffect(() => {
      if (progress >= 100) return;
      
      const interval = setInterval(() => {
        setProgress((prev) => {
          // Slowly creep forward between server updates for realism
          const next = prev + 0.05;
          // Don't jump ahead of the next major status if we don't know it yet
          if (booking.status === 'en_route' && next > 45) return prev;
          if (booking.status === 'picked_up' && next > 95) return prev;
          return next > 100 ? 100 : next;
        });
      }, 1000);
      return () => clearInterval(interval);
    }, [progress, booking.status]);

    return (
      <div className="fixed inset-0 bg-white z-50 flex flex-col">
        <header className="bg-white border-b border-gray-200 p-4 flex items-center gap-4">
          <button onClick={onBack} className="p-2 hover:bg-gray-100 rounded-full">
            <ChevronRight className="w-6 h-6 rotate-180" />
          </button>
          <div>
            <h2 className="font-bold text-lg">Tracking Order #{booking.id}</h2>
            <p className="text-sm text-gray-500">{booking.vehicle_type} • {booking.distance?.toFixed(1) || '0.0'} km</p>
          </div>
        </header>

        <div className="flex-1 relative bg-gray-100 overflow-hidden">
          {/* Simulated Map */}
          <div className="absolute inset-0 p-8 flex flex-col items-center justify-center">
            <div className="w-full max-w-2xl aspect-video bg-white rounded-3xl shadow-inner relative overflow-hidden border-8 border-white">
              {/* Map Grid */}
              <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(#000 1px, transparent 1px)', backgroundSize: '20px 20px' }} />
              
              {/* Pickup */}
              <div className="absolute left-10 top-1/2 -translate-y-1/2 text-center">
                <div className="w-4 h-4 bg-green-500 rounded-full mx-auto mb-2 shadow-lg shadow-green-200" />
                <div className="text-[10px] font-bold text-gray-400 uppercase">Pickup</div>
              </div>

              {/* Dropoff */}
              <div className="absolute right-10 top-1/2 -translate-y-1/2 text-center">
                <div className="w-4 h-4 bg-red-500 rounded-full mx-auto mb-2 shadow-lg shadow-red-200" />
                <div className="text-[10px] font-bold text-gray-400 uppercase">Dropoff</div>
              </div>

              {/* Path */}
              <div className="absolute left-12 right-12 top-1/2 h-1 bg-gray-100 -translate-y-1/2" />
              <motion.div 
                className="absolute left-12 top-1/2 h-1 bg-blue-600 -translate-y-1/2"
                style={{ width: `calc(${progress}% - 24px)` }}
              />

              {/* Vehicle */}
              <motion.div 
                className="absolute top-1/2 -translate-y-1/2 z-10"
                style={{ left: `calc(3rem + ${progress * 0.8}%)` }}
              >
                <div className="bg-white p-2 rounded-xl shadow-xl border border-gray-100 flex items-center justify-center">
                  {getVehicleIcon(VEHICLES.find(v => v.name === booking.vehicle_type)?.icon || 'Truck', "w-6 h-6 text-blue-600")}
                </div>
              </motion.div>
            </div>
          </div>

          {/* Status Overlay */}
          <div className="absolute bottom-0 left-0 right-0 p-6">
            <motion.div 
              initial={{ y: 100 }}
              animate={{ y: 0 }}
              className="bg-white rounded-3xl shadow-2xl p-6 border border-gray-100"
            >
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                    <Clock className="text-blue-600 w-6 h-6" />
                  </div>
                  <div>
                    <div className="text-sm text-gray-400 font-bold uppercase tracking-wider">Estimated Arrival</div>
                    <div className="flex items-baseline gap-2">
                      <span className="text-2xl font-bold text-gray-900">{minsRemaining} mins</span>
                      <span className="text-sm text-gray-500 font-medium">at {arrivalTimeString}</span>
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-bold text-green-600 bg-green-50 px-3 py-1 rounded-full inline-block">
                    {statusText}
                  </div>
                  <div className="text-[10px] text-gray-400 font-bold uppercase mt-1">
                    {( (booking.distance || 3) * (1 - progress/100) ).toFixed(1)} km left
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center overflow-hidden">
                    <img src="https://picsum.photos/seed/driver/100/100" alt="Driver" className="w-full h-full object-cover" />
                  </div>
                  <div className="flex-1">
                    <div className="font-bold text-gray-900">Ramesh Kumar</div>
                    <div className="text-sm text-gray-500">KA 01 AB 1234 • 4.9 ★</div>
                  </div>
                  <button className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold">Call</button>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </div>
    );
  };

  const getVehicleIcon = (iconName: string, className: string) => {
    switch (iconName) {
      case 'Bike': return <Bike className={className} />;
      case 'Truck': return <Truck className={className} />;
      case 'Home': return <Home className={className} />;
      case 'Car': return <Car className={className} />;
      case 'Box': return <Box className={className} />;
      default: return <Package className={className} />;
    }
  };

  const handleMapSearch = async () => {
    if (!mapSearchQuery) return;
    setSearchingMap(true);
    setMapSearchResults([]);
    try {
      const { GoogleGenAI } = await import("@google/genai");
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
      
      // Use gemini-2.5-flash for Google Maps grounding as per guidelines
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: `Find locations in India matching "${mapSearchQuery}". Specifically look for "Maple India" locations if relevant. Return a list of places with their names and addresses.`,
        config: {
          tools: [{ googleMaps: {} }]
        }
      });

      const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
      const results: MapSearchResult[] = [];

      if (groundingChunks) {
        groundingChunks.forEach((chunk: any) => {
          if (chunk.maps) {
            results.push({
              title: chunk.maps.title || 'Location',
              address: chunk.maps.title || 'India',
              latitude: 20.5937, // Default center of India if coords not provided
              longitude: 78.9629,
              url: chunk.maps.uri
            });
          }
        });
      }

      // If no grounding chunks, try to parse text or provide fallback
      if (results.length === 0) {
        // Fallback or parse text
        const text = response.text;
        // Simple regex to find potential addresses in text if grounding failed
        results.push({
          title: mapSearchQuery,
          address: text.slice(0, 100) + "...",
          latitude: 20.5937,
          longitude: 78.9629
        });
      }

      setMapSearchResults(results);
      if (results.length > 0) {
        setSelectedMapLocation(results[0]);
      }
    } catch (err) {
      console.error("Map search failed", err);
      setError("Failed to search locations. Please try again.");
    } finally {
      setSearchingMap(false);
    }
  };

  const MapSearchModal = () => (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 sm:p-6">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={() => setShowMapSearch(false)}
        className="absolute inset-0 bg-black/60 backdrop-blur-md"
      />
      <motion.div 
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        className="relative bg-white rounded-[2.5rem] shadow-2xl w-full max-w-5xl h-[85vh] flex flex-col overflow-hidden border border-white/20"
      >
        <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-white/80 backdrop-blur-md sticky top-0 z-10">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-200">
              <MapIcon className="text-white w-6 h-6" />
            </div>
            <div>
              <h3 className="text-2xl font-black text-gray-900 tracking-tight">Search Location</h3>
              <p className="text-sm text-gray-500 font-medium">Find a location in India</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setShowMapSearch(false)}
              className="px-6 py-3 bg-gray-900 text-white rounded-2xl font-bold hover:bg-gray-800 transition-all shadow-lg"
            >
              Done
            </button>
            <button 
              onClick={() => setShowMapSearch(false)}
              className="p-3 hover:bg-gray-100 rounded-2xl transition-all"
            >
              <X className="w-6 h-6 text-gray-400" />
            </button>
          </div>
        </div>

        <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
          {/* Search Sidebar */}
          <div className="w-full lg:w-96 border-r border-gray-100 flex flex-col bg-gray-50/50">
            <div className="p-6 space-y-4">
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input 
                  type="text" 
                  value={mapSearchQuery}
                  onChange={(e) => setMapSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleMapSearch()}
                  placeholder="Search for 'Maple India' or any address..."
                  className="w-full pl-12 pr-4 py-4 bg-white border border-gray-200 rounded-[1.25rem] focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all shadow-sm font-medium"
                />
              </div>
              <button 
                onClick={handleMapSearch}
                disabled={searchingMap || !mapSearchQuery}
                className="w-full py-4 bg-blue-600 text-white rounded-[1.25rem] font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-200 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {searchingMap ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>Search India Map</>
                )}
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 pt-0 space-y-3">
              {mapSearchResults.length > 0 ? (
                mapSearchResults.map((result, idx) => (
                  <div
                    key={idx}
                    onClick={() => setSelectedMapLocation(result)}
                    className={`w-full text-left p-4 rounded-2xl border transition-all cursor-pointer ${
                      selectedMapLocation === result 
                        ? 'bg-blue-600 border-blue-600 shadow-lg shadow-blue-100' 
                        : 'bg-white border-gray-100 hover:border-blue-200 hover:shadow-md'
                    }`}
                  >
                    <div className={`font-bold text-sm mb-1 ${selectedMapLocation === result ? 'text-white' : 'text-gray-900'}`}>
                      {result.title}
                    </div>
                    <div className={`text-xs line-clamp-2 ${selectedMapLocation === result ? 'text-blue-100' : 'text-gray-500'}`}>
                      {result.address}
                    </div>
                    
                    {selectedMapLocation === result && (
                      <div className="mt-4 flex gap-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setPickup(result.title);
                            setPickupCoords([result.latitude, result.longitude]);
                          }}
                          className="flex-1 bg-white text-blue-600 py-2 rounded-xl text-xs font-bold hover:bg-blue-50 transition-colors"
                        >
                          Set Pickup
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setDropoff(result.title);
                            setDropoffCoords([result.latitude, result.longitude]);
                          }}
                          className="flex-1 bg-blue-700 text-white py-2 rounded-xl text-xs font-bold hover:bg-blue-800 transition-colors"
                        >
                          Set Dropoff
                        </button>
                      </div>
                    )}

                    {result.url && (
                      <a 
                        href={result.url} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className={`text-[10px] font-bold uppercase tracking-widest mt-3 inline-block ${selectedMapLocation === result ? 'text-white/80 hover:text-white' : 'text-blue-600 hover:underline'}`}
                      >
                        View on Google Maps
                      </a>
                    )}
                  </div>
                ))
              ) : !searchingMap && mapSearchQuery && (
                <div className="text-center py-12">
                  <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Search className="w-8 h-8 text-gray-300" />
                  </div>
                  <p className="text-gray-400 font-medium">No results found in India</p>
                </div>
              )}
            </div>


          </div>

          {/* Map View */}
          <div className="flex-1 relative bg-gray-100">
            <MapContainer 
              center={[20.5937, 78.9629]} 
              zoom={5} 
              style={{ height: '100%', width: '100%' }}
              zoomControl={false}
            >
              <TileLayer
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              />
              {selectedMapLocation && (
                <>
                  <ChangeView center={[selectedMapLocation.latitude, selectedMapLocation.longitude]} />
                  <Marker 
                    key={`search-marker-${selectedMapLocation.latitude}-${selectedMapLocation.longitude}`}
                    position={[selectedMapLocation.latitude, selectedMapLocation.longitude]}
                  >
                    <Popup>
                      <div className="p-1">
                        <div className="font-bold text-sm">{selectedMapLocation.title}</div>
                        <div className="text-xs text-gray-500 mt-1">{selectedMapLocation.address}</div>
                      </div>
                    </Popup>
                  </Marker>
                </>
              )}
              {pickupCoords && (
                <Marker key={`modal-pickup-${pickupCoords[0]}-${pickupCoords[1]}`} position={pickupCoords}>
                  <Popup>Pickup: {pickup}</Popup>
                </Marker>
              )}
              {dropoffCoords && (
                <Marker key={`modal-dropoff-${dropoffCoords[0]}-${dropoffCoords[1]}`} position={dropoffCoords}>
                  <Popup>Dropoff: {dropoff}</Popup>
                </Marker>
              )}
              {pickupCoords && dropoffCoords && (
                <Polyline positions={[pickupCoords, dropoffCoords]} color="blue" dashArray="5, 10" />
              )}
            </MapContainer>
            
            {/* Map Overlay Info */}
            <div className="absolute top-6 right-6 z-[1000] pointer-events-none">
              <div className="bg-white/90 backdrop-blur-md p-4 rounded-2xl shadow-xl border border-white/20 max-w-xs">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                  <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Live India Map</span>
                </div>
                <p className="text-xs text-gray-600 font-medium leading-relaxed">
                  Searching for <strong>Maple India</strong> locations and more across the subcontinent.
                </p>
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );

  const LandingPage = () => (
    <div className="min-h-screen bg-white">
      <nav className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
            <Navigation className="text-white w-6 h-6" />
          </div>
          <span className="text-xl font-bold tracking-tight text-gray-900">MOVE SMART</span>
        </div>
        <div className="flex gap-4">
          <button onClick={() => setView('login')} className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-blue-600 transition-colors">Login</button>
          <button onClick={() => setView('signup')} className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">Sign Up</button>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-6 pt-20 pb-32">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <motion.div 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="space-y-8"
          >
            <h1 className="text-6xl font-extrabold text-gray-900 leading-[1.1] tracking-tight">
              Moving anything, <br />
              <span className="text-blue-600">anywhere, anytime.</span>
            </h1>
            <p className="text-xl text-gray-500 max-w-lg">
              The smartest way to move your goods. From two-wheelers to heavy trucks, we've got you covered in Bangalore.
            </p>
            <div className="flex gap-4">
              <button onClick={() => setView('signup')} className="px-8 py-4 bg-blue-600 text-white rounded-xl font-semibold text-lg hover:bg-blue-700 shadow-lg shadow-blue-200 transition-all flex items-center gap-2">
                Get Started <ArrowRight className="w-5 h-5" />
              </button>
              <button className="px-8 py-4 border-2 border-gray-200 text-gray-700 rounded-xl font-semibold text-lg hover:bg-gray-50 transition-all">
                View Pricing
              </button>
            </div>
            
            <div className="grid grid-cols-3 gap-8 pt-8 border-t border-gray-100">
              <div>
                <div className="text-3xl font-bold text-gray-900">10k+</div>
                <div className="text-sm text-gray-500">Active Drivers</div>
              </div>
              <div>
                <div className="text-3xl font-bold text-gray-900">50k+</div>
                <div className="text-sm text-gray-500">Happy Users</div>
              </div>
              <div>
                <div className="text-3xl font-bold text-gray-900">4.8/5</div>
                <div className="text-sm text-gray-500">User Rating</div>
              </div>
            </div>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="relative"
          >
            <div className="bg-blue-50 rounded-3xl p-8 aspect-square flex items-center justify-center overflow-hidden">
              <img 
                src="https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&fit=crop&q=80&w=800" 
                alt="Logistics" 
                className="rounded-2xl shadow-2xl object-cover w-full h-full"
                referrerPolicy="no-referrer"
              />
            </div>
            {/* Floating Price Card */}
            <div className="absolute -bottom-6 -left-6 bg-white p-6 rounded-2xl shadow-xl border border-gray-100 max-w-xs">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                  <Bike className="text-green-600 w-4 h-4" />
                </div>
                <span className="font-semibold">Two-Wheeler</span>
              </div>
              <div className="text-2xl font-bold text-gray-900">Starts at ₹48</div>
              <p className="text-xs text-gray-500 mt-1">Includes 1 km & 25 min waiting time</p>
            </div>
          </motion.div>
        </div>
      </main>
    </div>
  );

  const AuthView = ({ type }: { type: 'login' | 'signup' }) => (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-md border border-gray-100"
      >
        <div className="flex justify-center mb-8">
          <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center">
            <Navigation className="text-white w-8 h-8" />
          </div>
        </div>
        <h2 className="text-3xl font-bold text-center text-gray-900 mb-2">
          {type === 'login' ? 'Welcome Back' : 'Create Account'}
        </h2>
        <p className="text-center text-gray-500 mb-8">
          {type === 'login' ? 'Enter your details to access your account' : 'Join Move Smart for seamless logistics'}
        </p>

        {error && (
          <div className="mb-6 p-4 bg-red-50 text-red-600 rounded-lg flex items-center gap-3 text-sm">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            {error}
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
            <input 
              type="email" 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
              placeholder="name@example.com"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <input 
              type="password" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
              placeholder="••••••••"
            />
          </div>
          <button 
            onClick={() => handleAuth(type)}
            disabled={loading}
            className="w-full py-4 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 transition-all disabled:opacity-50"
          >
            {loading ? 'Processing...' : type === 'login' ? 'Sign In' : 'Create Account'}
          </button>
        </div>

        <p className="text-center mt-8 text-sm text-gray-500">
          {type === 'login' ? "Don't have an account? " : "Already have an account? "}
          <button 
            onClick={() => setView(type === 'login' ? 'signup' : 'login')}
            className="text-blue-600 font-semibold hover:underline"
          >
            {type === 'login' ? 'Sign Up' : 'Login'}
          </button>
        </p>
      </motion.div>
    </div>
  );

  const Dashboard = () => (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => setView('dashboard')}>
            <Navigation className="text-blue-600 w-6 h-6" />
            <span className="font-bold text-lg">MOVE SMART</span>
          </div>
          <div className="flex items-center gap-6">
            <div className="relative">
              <button 
                onClick={() => setShowNotifications(!showNotifications)}
                className="p-2 text-gray-400 hover:text-blue-600 transition-colors relative"
              >
                <Bell className="w-6 h-6" />
                {notifications.filter(n => !n.is_read).length > 0 && (
                  <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center border-2 border-white">
                    {notifications.filter(n => !n.is_read).length}
                  </span>
                )}
              </button>

              <AnimatePresence>
                {showNotifications && (
                  <>
                    <div className="fixed inset-0 z-20" onClick={() => setShowNotifications(false)} />
                    <motion.div 
                      initial={{ opacity: 0, y: 10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 10, scale: 0.95 }}
                      className="absolute right-0 mt-2 w-80 bg-white rounded-2xl shadow-2xl border border-gray-100 z-30 overflow-hidden"
                    >
                      <div className="p-4 border-b border-gray-100 flex justify-between items-center">
                        <h4 className="font-bold">Notifications</h4>
                        <div className="flex gap-3">
                          <button 
                            onClick={() => setNotifications(prev => prev.map(n => ({ ...n, is_read: 1 })))}
                            className="text-[10px] font-bold text-blue-600 hover:underline uppercase tracking-wider"
                          >
                            Mark all read
                          </button>
                          <button 
                            onClick={clearAllNotifications}
                            className="text-[10px] font-bold text-red-500 hover:underline uppercase tracking-wider"
                          >
                            Clear All
                          </button>
                        </div>
                      </div>
                      <div className="max-h-96 overflow-y-auto">
                        {notifications.length === 0 ? (
                          <div className="p-8 text-center text-gray-400 text-sm">
                            No notifications yet
                          </div>
                        ) : (
                          notifications.map(n => (
                            <div 
                              key={n.id} 
                              onClick={() => markAsRead(n.id)}
                              className={`p-4 border-b border-gray-50 hover:bg-gray-50 cursor-pointer transition-colors ${!n.is_read ? 'bg-blue-50/30' : ''}`}
                            >
                              <div className="flex justify-between items-start gap-2">
                                <span className="font-bold text-sm text-gray-900">{n.title}</span>
                                {!n.is_read && <div className="w-2 h-2 bg-blue-600 rounded-full mt-1.5" />}
                              </div>
                              <p className="text-xs text-gray-500 mt-1">{n.message}</p>
                              <div className="text-[10px] text-gray-400 mt-2">
                                {new Date(n.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>

            <button onClick={() => { setView('bookings'); fetchBookings(); }} className="text-sm font-medium text-gray-600 hover:text-blue-600 flex items-center gap-2">
              <Package className="w-4 h-4" /> My Bookings
            </button>
            {user?.role === 'admin' && (
              <button onClick={() => { setView('admin'); fetchAdminData(); }} className="text-sm font-bold text-orange-600 hover:bg-orange-50 px-3 py-1.5 rounded-xl transition-all flex items-center gap-2 border border-orange-100">
                <Lock className="w-4 h-4" /> Admin Panel
              </button>
            )}
            <button onClick={() => setView('profile')} className="text-sm font-medium text-gray-600 hover:text-blue-600 flex items-center gap-2">
              <UserIcon className="w-4 h-4" /> Profile
            </button>
            <div className="h-6 w-px bg-gray-200" />
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                <UserIcon className="text-blue-600 w-4 h-4" />
              </div>
              <span className="text-sm font-medium text-gray-700 hidden sm:block">{user?.email}</span>
              <button onClick={() => setUser(null)} className="p-2 text-gray-400 hover:text-red-500 transition-colors">
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-10">
        <div className="grid lg:grid-cols-3 gap-8">
          {/* Booking Form */}
          <div className="lg:col-span-1 space-y-6">
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-bold">Where are you moving?</h3>
                <div className="flex flex-col items-end">
                  <button 
                    onClick={saveDraftManually}
                    className="flex items-center gap-1.5 text-xs font-bold text-blue-600 hover:bg-blue-50 px-2 py-1 rounded-lg transition-colors"
                  >
                    <Save className="w-3.5 h-3.5" />
                    Save Draft
                  </button>
                  {lastSaved && (
                    <span className="text-[10px] text-gray-400 mt-1">
                      Saved {lastSaved.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  )}
                </div>
              </div>
              <div className="space-y-4">
                <div className="relative">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-green-500" />
                  <input 
                    type="text" 
                    placeholder="Pickup Address" 
                    value={pickup}
                    onChange={(e) => setPickup(e.target.value)}
                    className="w-full pl-10 pr-28 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                    <button 
                      onClick={() => setShowMapSearch(true)}
                      className="p-2 text-gray-400 hover:text-blue-600 rounded-lg transition-colors"
                      title="Search on Map"
                    >
                      <MapIcon className="w-5 h-5" />
                    </button>
                    <button 
                      onClick={() => setShowFavoriteModal({ address: pickup, type: 'pickup' })}
                      disabled={!pickup}
                      className="p-2 text-gray-400 hover:text-yellow-500 rounded-lg transition-colors disabled:opacity-30"
                      title="Save as Favorite"
                    >
                      <Star className="w-5 h-5" />
                    </button>
                    <button 
                      onClick={handleUseCurrentLocation}
                      disabled={locating}
                      className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors disabled:opacity-50"
                      title="Use Current Location"
                    >
                      <MapPin className={`w-5 h-5 ${locating ? 'animate-pulse' : ''}`} />
                    </button>
                  </div>
                </div>
                <div className="relative">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-red-500" />
                  <input 
                    type="text" 
                    placeholder="Dropoff Address" 
                    value={dropoff}
                    onChange={(e) => setDropoff(e.target.value)}
                    className="w-full pl-10 pr-20 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                    <button 
                      onClick={() => setShowMapSearch(true)}
                      className="p-2 text-gray-400 hover:text-blue-600 rounded-lg transition-colors"
                      title="Search on Map"
                    >
                      <MapIcon className="w-5 h-5" />
                    </button>
                    <button 
                      onClick={() => setShowFavoriteModal({ address: dropoff, type: 'dropoff' })}
                      disabled={!dropoff}
                      className="p-2 text-gray-400 hover:text-yellow-500 rounded-lg transition-colors disabled:opacity-30"
                      title="Save as Favorite"
                    >
                      <Star className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                {/* Dashboard Map */}
                {(pickupCoords || dropoffCoords) && (
                  <div className="h-48 w-full rounded-2xl overflow-hidden border border-gray-200 shadow-inner relative group">
                    <MapContainer 
                      center={pickupCoords || dropoffCoords || [20.5937, 78.9629]} 
                      zoom={13} 
                      style={{ height: '100%', width: '100%' }}
                      zoomControl={false}
                    >
                      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                      {pickupCoords && (
                        <Marker key={`pickup-${pickupCoords[0]}-${pickupCoords[1]}`} position={pickupCoords}>
                          <Popup>Pickup: {pickup}</Popup>
                        </Marker>
                      )}
                      {dropoffCoords && (
                        <Marker key={`dropoff-${dropoffCoords[0]}-${dropoffCoords[1]}`} position={dropoffCoords}>
                          <Popup>Dropoff: {dropoff}</Popup>
                        </Marker>
                      )}
                      {pickupCoords && dropoffCoords && (
                        <Polyline positions={[pickupCoords, dropoffCoords]} color="blue" dashArray="5, 10" />
                      )}
                      <MapUpdater pickup={pickupCoords} dropoff={dropoffCoords} />
                    </MapContainer>
                    <div className="absolute top-2 right-2 z-[1000] opacity-0 group-hover:opacity-100 transition-opacity">
                      <div className="bg-white/90 backdrop-blur-sm px-2 py-1 rounded-lg text-[10px] font-bold text-gray-500 shadow-sm border border-gray-100">
                        Live Preview
                      </div>
                    </div>
                  </div>
                )}

                {favorites.length > 0 && (
                  <div className="pt-2">
                    <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2 px-1">Favorite Addresses</div>
                    <div className="flex flex-wrap gap-2">
                      {favorites.map(fav => (
                        <div key={fav.id} className="group relative">
                          <div className="flex items-center bg-gray-100 rounded-lg overflow-hidden transition-all hover:shadow-md">
                            <button 
                              onClick={() => setPickup(fav.address)}
                              className="pl-3 pr-2 py-1.5 hover:bg-blue-50 hover:text-blue-600 text-[10px] font-bold border-r border-gray-200 transition-colors"
                              title="Set as Pickup"
                            >
                              P
                            </button>
                            <button 
                              onClick={() => setDropoff(fav.address)}
                              className="px-2 py-1.5 hover:bg-red-50 hover:text-red-600 text-[10px] font-bold border-r border-gray-200 transition-colors"
                              title="Set as Dropoff"
                            >
                              D
                            </button>
                            <div className="px-3 py-1.5 text-xs font-medium flex items-center gap-2">
                              <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" />
                              {fav.label}
                            </div>
                          </div>
                          <button 
                            onClick={(e) => { e.stopPropagation(); removeFavorite(fav.id); }}
                            className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-lg z-10"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {distance > 0 && (
                  <motion.div 
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="space-y-2"
                  >
                    <div className="flex items-center gap-2 text-sm text-gray-500 bg-gray-50 p-3 rounded-xl border border-dashed border-gray-200">
                      <Navigation className="w-4 h-4 text-blue-600" />
                      <span>Estimated Distance: <span className="font-bold text-gray-900">{distance} km</span></span>
                    </div>
                    {trafficStatus !== 'Unknown' && (
                      <div className={`flex items-center gap-2 text-sm p-3 rounded-xl border border-dashed ${
                        trafficStatus === 'Heavy' ? 'bg-red-50 border-red-200 text-red-600' : 
                        trafficStatus === 'Moderate' ? 'bg-orange-50 border-orange-200 text-orange-600' : 
                        'bg-green-50 border-green-200 text-green-600'
                      }`}>
                        <Clock className="w-4 h-4" />
                        <span>Traffic: <span className="font-bold">{trafficStatus}</span> 
                        {trafficMultiplier > 1 && <span className="text-xs ml-1">(x{trafficMultiplier} fare)</span>}</span>
                      </div>
                    )}
                  </motion.div>
                )}
              </div>
            </div>

            {selectedVehicle && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-blue-600 p-6 rounded-2xl text-white shadow-lg shadow-blue-200"
              >
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <div className="text-blue-100 text-sm">Estimated Fare</div>
                    <div className="text-3xl font-bold">₹{estimatedPrice}</div>
                  </div>
                  <div className="bg-white/20 p-2 rounded-lg">
                    {getVehicleIcon(selectedVehicle.icon, "w-6 h-6")}
                  </div>
                </div>
                <div className="space-y-2 text-sm text-blue-100 mb-6">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4" /> Base price included
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4" /> {selectedVehicle.capacity} capacity
                  </div>
                </div>
                <button 
                  onClick={handleBooking}
                  disabled={!pickup || !dropoff || loading}
                  className="w-full py-3 bg-white text-blue-600 rounded-xl font-bold hover:bg-blue-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? 'Booking...' : 'Confirm Booking'}
                </button>
              </motion.div>
            )}
          </div>

          {/* Vehicle Selection */}
          <div className="lg:col-span-2">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
              <h3 className="text-lg font-bold">Select Vehicle Type</h3>
              <div className="flex flex-wrap gap-2">
                {['all', 'bike', 'truck', 'van', 'other'].map((type) => (
                  <button
                    key={type}
                    onClick={() => setVehicleFilter(type as any)}
                    className={`px-4 py-2 rounded-full text-sm font-bold capitalize transition-all ${
                      vehicleFilter === type
                        ? 'bg-blue-600 text-white shadow-md shadow-blue-200'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {type}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              {VEHICLES.filter(v => vehicleFilter === 'all' || v.type === vehicleFilter).map((v) => (
                <button
                  key={v.id}
                  onClick={() => setSelectedVehicle(v)}
                  className={`p-6 rounded-2xl border-2 text-left transition-all relative overflow-hidden group ${
                    selectedVehicle?.id === v.id 
                      ? 'border-blue-600 bg-blue-50 ring-4 ring-blue-50' 
                      : 'border-white bg-white hover:border-gray-200 hover:shadow-md'
                  }`}
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-4">
                      <div className={`p-4 rounded-2xl transition-colors ${
                        selectedVehicle?.id === v.id ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 group-hover:bg-gray-200'
                      }`}>
                        {getVehicleIcon(v.icon, "w-8 h-8")}
                      </div>
                      <div>
                        <h4 className="font-bold text-gray-900 text-xl">{v.name}</h4>
                        <p className="text-sm font-medium text-blue-600">{v.capacity}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] text-gray-400 uppercase font-black tracking-widest">Starts at</div>
                      <div className="text-2xl font-black text-gray-900">₹{v.basePrice}</div>
                    </div>
                  </div>
                  
                  <div className="mt-4 pt-4 border-t border-gray-100/50">
                    <p className="text-sm text-gray-500 leading-relaxed">{v.description}</p>
                  </div>

                  {selectedVehicle?.id === v.id && (
                    <motion.div 
                      layoutId="active-indicator"
                      className="absolute top-2 right-2"
                    >
                      <CheckCircle2 className="w-5 h-5 text-blue-600" />
                    </motion.div>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      </main>

      <AnimatePresence>
        {bookingSuccess && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-6"
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="bg-white p-8 rounded-3xl shadow-2xl max-w-sm w-full text-center"
            >
              <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <CheckCircle2 className="text-green-600 w-12 h-12" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Booking Confirmed!</h2>
              <p className="text-gray-500">Your driver will be assigned shortly. Redirecting to your bookings...</p>
            </motion.div>
          </motion.div>
        )}

        {showFavoriteModal && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowFavoriteModal(null)}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-white rounded-3xl shadow-2xl p-8 w-full max-w-md border border-gray-100"
            >
              <h3 className="text-2xl font-bold text-gray-900 mb-2">Save Favorite</h3>
              <p className="text-gray-500 text-sm mb-6">Give this address a label like "Home" or "Office".</p>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Label</label>
                  <input 
                    type="text" 
                    value={favoriteLabel}
                    onChange={(e) => setFavoriteLabel(e.target.value)}
                    placeholder="e.g. Home, Office, Gym"
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                    autoFocus
                  />
                </div>
                <div className="p-4 bg-blue-50 rounded-xl border border-blue-100">
                  <div className="text-[10px] font-bold text-blue-400 uppercase tracking-wider mb-1">Address</div>
                  <div className="text-sm text-blue-900 font-medium line-clamp-2">{showFavoriteModal.address}</div>
                </div>
                
                <div className="flex gap-3 pt-4">
                  <button 
                    onClick={() => setShowFavoriteModal(null)}
                    className="flex-1 py-3 bg-gray-100 text-gray-600 rounded-xl font-bold hover:bg-gray-200 transition-colors"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={addFavorite}
                    disabled={!favoriteLabel}
                    className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-colors disabled:opacity-50"
                  >
                    Save Favorite
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}

        {showPaymentModal && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-white rounded-3xl shadow-2xl p-8 w-full max-w-md border border-gray-100"
            >
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-2xl font-bold text-gray-900">Complete Payment</h3>
                <button onClick={() => setShowPaymentModal(false)} className="text-gray-400 hover:text-gray-600">
                  <X className="w-6 h-6" />
                </button>
              </div>
              
              <div className="mb-6 p-4 bg-blue-50 rounded-xl border border-blue-100">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm text-blue-800 font-medium">Vehicle</span>
                  <span className="text-sm font-bold text-blue-900">{selectedVehicle?.name}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-blue-800 font-medium">Total Amount</span>
                  <span className="text-xl font-black text-blue-900">₹{estimatedPrice}</span>
                </div>
              </div>

              {clientSecret && (
                <Elements stripe={stripePromise} options={{ clientSecret }}>
                  <PaymentForm />
                </Elements>
              )}
            </motion.div>
          </div>
        )}

        {showMapSearch && <MapSearchModal />}
      </AnimatePresence>
    </div>
  );

  const AdminDashboard = () => {
    const [activeTab, setActiveTab] = useState<'bookings' | 'users'>('bookings');

    return (
      <div className="min-h-screen bg-gray-50">
        <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
          <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
            <div className="flex items-center gap-2 cursor-pointer" onClick={() => setView('dashboard')}>
              <Navigation className="text-blue-600 w-6 h-6" />
              <span className="font-bold text-lg">MOVE SMART <span className="text-orange-600 text-xs ml-1 uppercase tracking-widest">Admin</span></span>
            </div>
            <button onClick={() => setView('dashboard')} className="text-sm font-medium text-blue-600 hover:bg-blue-50 px-4 py-2 rounded-lg transition-colors">
              Back to Dashboard
            </button>
          </div>
        </header>

        <main className="max-w-7xl mx-auto px-6 py-10">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-3xl font-bold text-gray-900">Admin Control Panel</h2>
            <div className="flex bg-white p-1 rounded-xl border border-gray-200 shadow-sm">
              <button 
                onClick={() => setActiveTab('bookings')}
                className={`px-6 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'bookings' ? 'bg-orange-600 text-white shadow-lg shadow-orange-100' : 'text-gray-500 hover:bg-gray-50'}`}
              >
                All Bookings
              </button>
              <button 
                onClick={() => setActiveTab('users')}
                className={`px-6 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'users' ? 'bg-orange-600 text-white shadow-lg shadow-orange-100' : 'text-gray-500 hover:bg-gray-50'}`}
              >
                User Management
              </button>
            </div>
          </div>

          {adminLoading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-10 h-10 border-4 border-orange-200 border-t-orange-600 rounded-full animate-spin" />
            </div>
          ) : activeTab === 'bookings' ? (
            <div className="bg-white rounded-3xl border border-gray-200 shadow-sm overflow-hidden">
              <table className="w-full text-left">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider">Order</th>
                    <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider">Customer</th>
                    <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider">Route</th>
                    <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider">Price</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {adminBookings.map((b) => (
                    <tr key={b.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="font-bold text-gray-900">#{b.id}</div>
                        <div className="text-[10px] text-gray-400 font-medium">{new Date(b.created_at).toLocaleDateString()}</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="font-bold text-gray-900">{b.user_name || 'Guest'}</div>
                        <div className="text-xs text-gray-500">{b.user_email}</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-xs font-medium text-gray-900 line-clamp-1">From: {b.pickup_address}</div>
                        <div className="text-xs font-medium text-gray-500 line-clamp-1">To: {b.dropoff_address}</div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded-full ${
                          b.status === 'delivered' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'
                        }`}>
                          {b.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 font-bold text-gray-900">₹{b.estimated_price}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {adminUsers.map((u) => (
                <div key={u.id} className="bg-white p-6 rounded-3xl border border-gray-200 shadow-sm hover:shadow-md transition-all">
                  <div className="flex items-center gap-4 mb-6">
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${u.role === 'admin' ? 'bg-orange-100 text-orange-600' : 'bg-blue-100 text-blue-600'}`}>
                      <UserIcon className="w-6 h-6" />
                    </div>
                    <div>
                      <div className="font-bold text-gray-900">{u.name || 'No Name'}</div>
                      <div className="text-xs text-gray-500">{u.email}</div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between pt-4 border-t border-gray-50">
                    <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Role: {u.role}</div>
                    <select 
                      value={u.role}
                      onChange={(e) => updateUserRole(u.id, e.target.value)}
                      className="text-xs font-bold text-blue-600 bg-blue-50 px-3 py-1 rounded-lg border-none focus:ring-2 focus:ring-blue-500 outline-none cursor-pointer"
                    >
                      <option value="user">User</option>
                      <option value="admin">Admin</option>
                    </select>
                  </div>
                </div>
              ))}
            </div>
          )}
        </main>
      </div>
    );
  };

  const BookingsView = () => (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => setView('dashboard')}>
            <Navigation className="text-blue-600 w-6 h-6" />
            <span className="font-bold text-lg">MOVE SMART</span>
          </div>
          <div className="flex items-center gap-4">
            <button onClick={() => setView('profile')} className="text-sm font-medium text-gray-600 hover:text-blue-600 flex items-center gap-2">
              <UserIcon className="w-4 h-4" /> Profile
            </button>
            <button onClick={() => setView('dashboard')} className="text-sm font-medium text-blue-600 hover:bg-blue-50 px-4 py-2 rounded-lg transition-colors">
              Back to Dashboard
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-8">
          <h2 className="text-2xl font-bold">Your Bookings</h2>
          <div className="flex bg-gray-100 p-1 rounded-xl">
            <button
              onClick={() => setBookingTab('current')}
              className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${
                bookingTab === 'current' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              Current
            </button>
            <button
              onClick={() => setBookingTab('past')}
              className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${
                bookingTab === 'past' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              Past
            </button>
          </div>
        </div>
        <div className="space-y-4">
          {userBookings.filter(b => bookingTab === 'current' ? !['completed', 'cancelled'].includes(b.status.toLowerCase()) : ['completed', 'cancelled'].includes(b.status.toLowerCase())).length === 0 ? (
            <div className="bg-white p-12 rounded-2xl text-center border border-gray-200">
              <Package className="w-16 h-16 text-gray-200 mx-auto mb-4" />
              <h3 className="text-lg font-bold text-gray-900">No {bookingTab} bookings</h3>
              <p className="text-gray-500 mb-6">You don't have any {bookingTab} bookings at the moment.</p>
              <button onClick={() => setView('dashboard')} className="px-6 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-colors">
                Book Now
              </button>
            </div>
          ) : (
            userBookings
              .filter(b => bookingTab === 'current' ? !['completed', 'cancelled'].includes(b.status.toLowerCase()) : ['completed', 'cancelled'].includes(b.status.toLowerCase()))
              .map((b) => (
              <div key={b.id} className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
                      {getVehicleIcon(VEHICLES.find(v => v.name === b.vehicle_type)?.icon || 'Truck', "text-gray-600 w-6 h-6")}
                    </div>
                    <div>
                      <div className="font-bold text-gray-900">{b.vehicle_type}</div>
                      <div className="text-xs text-gray-400">{new Date(b.created_at).toLocaleDateString()} at {new Date(b.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold text-blue-600">₹{b.estimated_price}</div>
                    <div className="text-xs font-bold uppercase tracking-wider text-green-600 bg-green-50 px-2 py-1 rounded inline-block mt-1">
                      {b.status}
                    </div>
                    {bookingTab === 'current' && (
                      <button 
                        onClick={() => {
                          setTrackingBooking(b);
                          setView('dashboard');
                        }}
                        className="block mt-2 text-xs font-bold text-blue-600 hover:underline"
                      >
                        Track Order
                      </button>
                    )}
                  </div>
                </div>
                <div className="space-y-3 pt-4 border-t border-gray-50">
                  <div className="flex items-start gap-3">
                    <div className="w-2 h-2 rounded-full bg-green-500 mt-1.5" />
                    <div className="text-sm text-gray-600"><span className="font-bold text-gray-900">Pickup:</span> {b.pickup_address}</div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-2 h-2 rounded-full bg-red-500 mt-1.5" />
                    <div className="text-sm text-gray-600"><span className="font-bold text-gray-900">Dropoff:</span> {b.dropoff_address}</div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </main>
    </div>
  );

  const ProfileView = () => {
    const [profileName, setProfileName] = useState(user?.name || '');
    const [profilePhone, setProfilePhone] = useState(user?.phone || '');
    const [currentPass, setCurrentPass] = useState('');
    const [newPass, setNewPass] = useState('');
    const [confirmPass, setConfirmPass] = useState('');
    const [profileStatus, setProfileStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null);
    const [passStatus, setPassStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null);
    const [updating, setUpdating] = useState(false);
    const [isAddingFavorite, setIsAddingFavorite] = useState(false);
    const [newFavLabel, setNewFavLabel] = useState('');
    const [newFavAddress, setNewFavAddress] = useState('');

    const handleAddFavoriteInProfile = async () => {
      if (!user || !newFavLabel || !newFavAddress) return;
      setUpdating(true);
      try {
        const res = await fetch('/api/favorites', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: user.id,
            label: newFavLabel,
            address: newFavAddress
          })
        });
        const data = await res.json();
        if (data.success) {
          setFavorites(prev => [...prev, { id: data.id, user_id: user.id, label: newFavLabel, address: newFavAddress }]);
          setIsAddingFavorite(false);
          setNewFavLabel('');
          setNewFavAddress('');
        }
      } catch (err) {
        console.error('Failed to add favorite');
      } finally {
        setUpdating(false);
      }
    };

    const handleDeleteAccount = async () => {
      if (!user) return;
      if (!window.confirm('Are you absolutely sure you want to delete your account? This action cannot be undone.')) return;
      
      setUpdating(true);
      try {
        const res = await fetch(`/api/user/${user.id}`, { method: 'DELETE' });
        const data = await res.json();
        if (data.success) {
          setUser(null);
          setView('landing');
        }
      } catch (err) {
        console.error('Failed to delete account');
      } finally {
        setUpdating(false);
      }
    };

    const handleUpdateProfile = async () => {
      if (!user) return;
      setUpdating(true);
      setProfileStatus(null);
      try {
        const res = await fetch(`/api/user/${user.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: profileName, phone: profilePhone })
        });
        const data = await res.json();
        if (data.success) {
          setUser({ ...user, name: profileName, phone: profilePhone });
          setProfileStatus({ type: 'success', message: 'Profile updated successfully!' });
        } else {
          setProfileStatus({ type: 'error', message: data.error || 'Failed to update profile' });
        }
      } catch (err) {
        setProfileStatus({ type: 'error', message: 'Something went wrong' });
      } finally {
        setUpdating(false);
      }
    };

    const handleUpdatePassword = async () => {
      if (!user) return;
      if (newPass !== confirmPass) {
        setPassStatus({ type: 'error', message: 'Passwords do not match' });
        return;
      }
      setUpdating(true);
      setPassStatus(null);
      try {
        const res = await fetch(`/api/user/${user.id}/password`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ currentPassword: currentPass, newPassword: newPass })
        });
        const data = await res.json();
        if (data.success) {
          setPassStatus({ type: 'success', message: 'Password updated successfully!' });
          setCurrentPass('');
          setNewPass('');
          setConfirmPass('');
        } else {
          setPassStatus({ type: 'error', message: data.error || 'Failed to update password' });
        }
      } catch (err) {
        setPassStatus({ type: 'error', message: 'Something went wrong' });
      } finally {
        setUpdating(false);
      }
    };

    return (
      <div className="min-h-screen bg-gray-50">
        <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
          <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
            <div className="flex items-center gap-2 cursor-pointer" onClick={() => setView('dashboard')}>
              <Navigation className="text-blue-600 w-6 h-6" />
              <span className="font-bold text-lg">MOVE SMART</span>
            </div>
            <button onClick={() => setView('dashboard')} className="text-sm font-medium text-blue-600 hover:bg-blue-50 px-4 py-2 rounded-lg transition-colors">
              Back to Dashboard
            </button>
          </div>
        </header>

        <main className="max-w-4xl mx-auto px-6 py-10">
          <div className="flex items-center gap-4 mb-8">
            <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-200">
              <UserIcon className="text-white w-8 h-8" />
            </div>
            <div>
              <h2 className="text-3xl font-bold text-gray-900">Your Profile</h2>
              <p className="text-gray-500">Manage your account settings and preferences</p>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            {/* Contact Details */}
            <div className="space-y-6">
              <div className="bg-white p-8 rounded-3xl border border-gray-200 shadow-sm">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center">
                    <Mail className="text-blue-600 w-5 h-5" />
                  </div>
                  <h3 className="text-xl font-bold text-gray-900">Contact Details</h3>
                </div>

                {profileStatus && (
                  <div className={`mb-6 p-4 rounded-xl flex items-center gap-3 text-sm ${profileStatus.type === 'success' ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'}`}>
                    {profileStatus.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
                    {profileStatus.message}
                  </div>
                )}

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">Email Address</label>
                    <div className="relative">
                      <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                      <input 
                        type="email" 
                        value={user?.email} 
                        disabled 
                        className="w-full pl-12 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-500 cursor-not-allowed"
                      />
                    </div>
                    <p className="text-[10px] text-gray-400 mt-1 uppercase font-bold tracking-wider">Email cannot be changed</p>
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">Full Name</label>
                    <div className="relative">
                      <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                      <input 
                        type="text" 
                        value={profileName}
                        onChange={(e) => setProfileName(e.target.value)}
                        placeholder="Enter your full name"
                        className="w-full pl-12 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">Phone Number</label>
                    <div className="relative">
                      <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                      <input 
                        type="tel" 
                        value={profilePhone}
                        onChange={(e) => setProfilePhone(e.target.value)}
                        placeholder="+91 XXXXX XXXXX"
                        className="w-full pl-12 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                      />
                    </div>
                  </div>
                  <button 
                    onClick={handleUpdateProfile}
                    disabled={updating}
                    className="w-full py-4 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-100 disabled:opacity-50"
                  >
                    <Save className="w-5 h-5" />
                    {updating ? 'Updating...' : 'Save Changes'}
                  </button>
                </div>
              </div>
            </div>

            {/* Password Security */}
            <div className="space-y-6">
              <div className="bg-white p-8 rounded-3xl border border-gray-200 shadow-sm">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 bg-orange-50 rounded-xl flex items-center justify-center">
                    <Lock className="text-orange-600 w-5 h-5" />
                  </div>
                  <h3 className="text-xl font-bold text-gray-900">Security</h3>
                </div>

                {passStatus && (
                  <div className={`mb-6 p-4 rounded-xl flex items-center gap-3 text-sm ${passStatus.type === 'success' ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'}`}>
                    {passStatus.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
                    {passStatus.message}
                  </div>
                )}

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">Current Password</label>
                    <div className="relative">
                      <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                      <input 
                        type="password" 
                        value={currentPass}
                        onChange={(e) => setCurrentPass(e.target.value)}
                        placeholder="••••••••"
                        className="w-full pl-12 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                      />
                    </div>
                  </div>
                  <div className="h-px bg-gray-100 my-2" />
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">New Password</label>
                    <div className="relative">
                      <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                      <input 
                        type="password" 
                        value={newPass}
                        onChange={(e) => setNewPass(e.target.value)}
                        placeholder="••••••••"
                        className="w-full pl-12 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">Confirm New Password</label>
                    <div className="relative">
                      <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                      <input 
                        type="password" 
                        value={confirmPass}
                        onChange={(e) => setConfirmPass(e.target.value)}
                        placeholder="••••••••"
                        className="w-full pl-12 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                      />
                    </div>
                  </div>
                  <button 
                    onClick={handleUpdatePassword}
                    disabled={updating || !newPass || !currentPass}
                    className="w-full py-4 bg-gray-900 text-white rounded-xl font-bold hover:bg-black transition-all flex items-center justify-center gap-2 shadow-lg shadow-gray-100 disabled:opacity-50"
                  >
                    <Lock className="w-5 h-5" />
                    {updating ? 'Updating...' : 'Update Password'}
                  </button>
                </div>
              </div>

              <div className="bg-red-50 p-6 rounded-3xl border border-red-100">
                <h4 className="font-bold text-red-900 mb-2">Danger Zone</h4>
                <p className="text-sm text-red-600 mb-4">Once you delete your account, there is no going back. Please be certain.</p>
                <button 
                  onClick={handleDeleteAccount}
                  disabled={updating}
                  className="text-sm font-bold text-red-600 hover:underline disabled:opacity-50"
                >
                  {updating ? 'Processing...' : 'Delete Account'}
                </button>
              </div>
            </div>
          </div>

          {/* Favorite Addresses Section */}
          <div className="mt-8">
            <div className="bg-white p-8 rounded-3xl border border-gray-200 shadow-sm">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-yellow-50 rounded-xl flex items-center justify-center">
                    <Star className="text-yellow-600 w-5 h-5 fill-yellow-600" />
                  </div>
                  <h3 className="text-xl font-bold text-gray-900">Favorite Addresses</h3>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">{favorites.length} Saved</span>
                  <button 
                    onClick={() => setIsAddingFavorite(!isAddingFavorite)}
                    className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 transition-all"
                  >
                    {isAddingFavorite ? 'Cancel' : 'Add New'}
                  </button>
                </div>
              </div>

              <AnimatePresence>
                {isAddingFavorite && (
                  <motion.div 
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="mb-8 p-6 bg-blue-50 rounded-2xl border border-blue-100 overflow-hidden"
                  >
                    <h4 className="font-bold text-blue-900 mb-4">Add New Favorite</h4>
                    <div className="grid sm:grid-cols-2 gap-4 mb-4">
                      <div>
                        <label className="block text-[10px] font-bold text-blue-400 uppercase tracking-wider mb-1">Label</label>
                        <input 
                          type="text" 
                          placeholder="e.g. Home, Office"
                          value={newFavLabel}
                          onChange={(e) => setNewFavLabel(e.target.value)}
                          className="w-full px-4 py-2 bg-white border border-blue-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-blue-400 uppercase tracking-wider mb-1">Address</label>
                        <input 
                          type="text" 
                          placeholder="Full Address"
                          value={newFavAddress}
                          onChange={(e) => setNewFavAddress(e.target.value)}
                          className="w-full px-4 py-2 bg-white border border-blue-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                        />
                      </div>
                    </div>
                    <button 
                      onClick={handleAddFavoriteInProfile}
                      disabled={updating || !newFavLabel || !newFavAddress}
                      className="w-full py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-all disabled:opacity-50"
                    >
                      {updating ? 'Saving...' : 'Save Address'}
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>

              {favorites.length === 0 ? (
                <div className="text-center py-10 bg-gray-50 rounded-2xl border border-dashed border-gray-200">
                  <Star className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500 font-medium">No favorite addresses yet</p>
                  <p className="text-xs text-gray-400 mt-1">Save addresses from the booking form to see them here</p>
                </div>
              ) : (
                <div className="grid sm:grid-cols-2 gap-4">
                  {favorites.map((fav) => (
                    <div key={fav.id} className="group p-4 bg-gray-50 rounded-2xl border border-gray-100 hover:border-blue-200 hover:bg-blue-50/30 transition-all">
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center shadow-sm">
                            <Home className="w-4 h-4 text-blue-600" />
                          </div>
                          <span className="font-bold text-gray-900">{fav.label}</span>
                        </div>
                        <button 
                          onClick={() => removeFavorite(fav.id)}
                          className="p-2 text-gray-400 hover:text-red-500 hover:bg-white rounded-lg transition-all"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                      <p className="text-sm text-gray-500 line-clamp-2">{fav.address}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
    );
  };

  if (!user) {
    if (view === 'login') return <AuthView type="login" />;
    if (view === 'signup') return <AuthView type="signup" />;
    return <LandingPage />;
  }

  if (view === 'bookings') return <BookingsView />;
  if (view === 'profile') return <ProfileView />;
  if (view === 'admin') return <AdminDashboard />;
  return (
    <>
      <Dashboard />
      {trackingBooking && (
        <LiveTracking 
          booking={trackingBooking} 
          onBack={() => {
            setTrackingBooking(null);
            fetchBookings();
          }} 
        />
      )}
      
      {/* Toast Notification */}
      <AnimatePresence>
        {newNotificationToast && (
          <motion.div 
            initial={{ opacity: 0, x: 100 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 100 }}
            className="fixed bottom-6 right-6 z-[100] bg-white rounded-2xl shadow-2xl border-l-4 border-blue-600 p-4 w-80 flex gap-4 items-start cursor-pointer"
            onClick={() => {
              if (newNotificationToast.type !== 'booking_confirmed') {
                // If it's a status update, try to find the booking and track it
                // For simplicity in this demo, we'll just open the latest booking
                if (userBookings.length > 0) {
                  setTrackingBooking(userBookings[0]);
                }
              }
              setShowNotifications(true);
              setNewNotificationToast(null);
            }}
          >
            <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
              <Bell className="text-blue-600 w-5 h-5" />
            </div>
            <div>
              <div className="font-bold text-gray-900 text-sm">{newNotificationToast.title}</div>
              <p className="text-xs text-gray-500 mt-1 line-clamp-2">{newNotificationToast.message}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
