export interface Notification {
  id: number;
  user_id: number;
  booking_id?: number | null;
  title: string;
  message: string;
  type: string;
  is_read: number;
  created_at: string;
}

export interface User {
  id: number;
  email: string;
  name?: string;
  phone?: string;
  role?: 'user' | 'admin';
}

export interface Favorite {
  id: number;
  user_id: number;
  label: string;
  address: string;
}

export interface Booking {
  id: number;
  user_id: number;
  vehicle_type: string;
  pickup_address: string;
  dropoff_address: string;
  estimated_price: number;
  distance?: number;
  status: string;
  created_at: string;
}

export interface Vehicle {
  id: string;
  name: string;
  type: 'bike' | 'truck' | 'van' | 'other';
  capacity: string;
  basePrice: number;
  description: string;
  icon: string;
}

export interface MapSearchResult {
  title: string;
  address: string;
  latitude: number;
  longitude: number;
  url?: string;
}

export const VEHICLES: Vehicle[] = [
  {
    id: 'two-wheeler',
    name: 'Two-Wheeler',
    type: 'bike',
    capacity: 'Up to 20kg',
    basePrice: 48,
    description: 'Incl. 1 km & 25 min',
    icon: 'Bike'
  },
  {
    id: 'three-wheeler',
    name: 'Three-Wheeler',
    type: 'truck',
    capacity: '500kg',
    basePrice: 205,
    description: 'Includes 100 base charge',
    icon: 'Truck'
  },
  {
    id: 'tata-ace',
    name: 'Tata Ace',
    type: 'truck',
    capacity: '750kg',
    basePrice: 230,
    description: 'Popular for small moves',
    icon: 'Truck'
  },
  {
    id: 'pickup-8ft',
    name: 'Pickup 8ft',
    type: 'truck',
    capacity: '1250kg',
    basePrice: 330,
    description: 'Heavy duty pickup',
    icon: 'Car'
  },
  {
    id: 'van',
    name: 'Van',
    type: 'van',
    capacity: '1000kg',
    basePrice: 280,
    description: 'Enclosed transport for safe delivery',
    icon: 'Car'
  },
  {
    id: 'tata-407',
    name: 'Tata 407',
    type: 'truck',
    capacity: '2500kg',
    basePrice: 591,
    description: 'Large commercial truck',
    icon: 'Truck'
  },
  {
    id: 'packers-movers',
    name: 'Packers & Movers',
    type: 'other',
    capacity: '1 RK/1 BHK',
    basePrice: 1200,
    description: 'Micro-shifting starts here',
    icon: 'Home'
  }
];
