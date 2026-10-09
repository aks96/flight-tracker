# Flight Tracker - Production Ready Application

A complete flight price monitoring application built with React Native, Expo, Node.js/Express, and PostgreSQL. Track flight prices in real-time and receive notifications when prices drop!

## 🎯 Features

### Core Features
- ✈️ **Real-time Price Tracking** - Monitor flight prices across multiple airlines using Duffel API
- 🔔 **Push Notifications** - Get instant alerts when prices drop by your specified amount
- 📊 **Price History** - View historical price trends and analytics
- 🤖 **AI Price Predictions** - Get recommendations on the best time to book
- 🔐 **Secure Authentication** - JWT-based auth with refresh tokens
- 🌍 **Multi-currency Support** - Track prices in INR, USD, EUR, and more
- 📱 **Native Mobile App** - iOS and Android apps via Expo
- 🎨 **Beautiful UI** - Modern, clean interface with excellent UX

### Advanced Features
- **Trip Customization** - Support for one-way and round-trip flights
- **Passenger Configuration** - Track prices for specific passenger combinations (adults, children, infants)
- **Cabin Class Filtering** - Economy, Business, First Class support
- **Flexible Date Ranges** - Search within date windows for better deals
- **Multiple Devices** - Track on phone, tablet, and web seamlessly
- **Background Jobs** - Scheduler checks prices every 5 minutes
- **Rate Limiting** - API protection against abuse
- **Production Deployment** - Ready for AWS, Render, DigitalOcean

## 🏗️ Architecture

### Tech Stack

**Backend**
- Node.js 20.19.4+
- Express 4.18.2
- TypeScript 5.3.3
- PostgreSQL 15+ with TimescaleDB
- Redis/Upstash (BullMQ job queue)
- Axios for HTTP requests

**Mobile**
- React Native 0.86.2
- Expo 57.0.12
- TypeScript 5.3.3
- Zustand 4.4.1 (state management)
- Axios (HTTP client)
- expo-notifications (push notifications)

**Infrastructure**
- Docker & Docker Compose
- GitHub Actions CI/CD
- EAS Build (mobile builds)
- Nginx (reverse proxy)
- Timescale Cloud (production DB)
- Upstash Redis (production cache)

### System Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    Mobile App (iOS/Android)                 │
│                  React Native + Expo                         │
└──────────────┬──────────────────────────────────────────────┘
               │
               │ HTTPS/REST API
               │
        ┌──────▼──────────────┐
        │   Nginx Proxy       │
        │  Rate Limiting      │
        │  Load Balancing     │
        └──────┬──────────────┘
               │
        ┌──────▼──────────────────────────────────────┐
        │      Express Backend Server                 │
        │  - Authentication & Authorization          │
        │  - Tracker Management                       │
        │  - Device Registration                      │
        │  - Price Predictions                        │
        └──────┬──────────────┬──────────────────────┘
               │              │
        ┌──────▼────┐  ┌──────▼─────────────┐
        │ PostgreSQL │  │  Redis/BullMQ      │
        │ + TimescaleDB│ - Job Queue        │
        │ - Users    │  │ - Price Checks     │
        │ - Trackers │  │ - Notifications    │
        │ - Prices   │  └────────────────────┘
        │ - Devices  │
        └────────────┘
               │
        ┌──────▼──────────────────────┐
        │  Duffel API                 │
        │  Flight Data & Prices       │
        └─────────────────────────────┘
```

## 📱 Mobile App Screens

1. **Login Screen** - Email/password authentication
2. **Signup Screen** - Create new account
3. **Dashboard** - View all active trackers with current prices
4. **Create Tracker** - Set up new price monitoring with custom parameters
5. **Tracker Detail** - View tracker details, price history, statistics
6. **Settings** - Account settings, preferences, logout

## 🔌 API Endpoints

### Authentication
```
POST   /api/auth/signup           - Create new account
POST   /api/auth/login            - Login with email/password
POST   /api/auth/refresh          - Refresh access token
GET    /api/auth/me               - Get current user
```

### Trackers
```
POST   /api/trackers              - Create new tracker
GET    /api/trackers              - Get user's trackers
GET    /api/trackers/:id          - Get specific tracker
PATCH  /api/trackers/:id          - Update tracker
DELETE /api/trackers/:id          - Delete tracker
POST   /api/trackers/:id/pause    - Pause price monitoring
POST   /api/trackers/:id/resume   - Resume price monitoring
```

### Devices
```
POST   /api/devices/register      - Register device for notifications
GET    /api/devices               - Get user's devices
DELETE /api/devices/:deviceId     - Deactivate device
POST   /api/devices/:deviceId/ping - Keep-alive ping
```

### Predictions
```
GET    /api/predictions/tracker/:id/trend       - Get price trend
GET    /api/predictions/tracker/:id/best-time   - Best time to book
GET    /api/predictions/tracker/:id/statistics  - Price statistics
```

## 🚀 Quick Start

### Prerequisites
- Node.js 20.19.4+
- npm 10+
- Docker & Docker Compose (for local DB)
- Expo CLI: `npm install -g expo-cli`

### Local Development

**1. Clone and Install**
```bash
git clone <repo>
cd flight-tracker
npm install

# Install dependencies for each app
cd apps/backend && npm install
cd ../mobile && npm install
cd ../..
```

**2. Setup Environment**
```bash
# Backend
cp apps/backend/.env.example apps/backend/.env

# Mobile
cp apps/mobile/.env.example apps/mobile/.env
```

**3. Start Database (Optional)**
```bash
docker compose up -d postgres redis
```

**4. Run Backend**
```bash
cd apps/backend
npm run dev
# Server runs at http://localhost:3000
```

**5. Run Mobile App**
```bash
cd apps/mobile
npm start
# Scan QR code with Expo Go app or run on simulator
```

## 📦 Production Deployment

### Backend Deployment (Render)

1. **Connect GitHub Repository**
   - Push code to GitHub
   - Create new Web Service on Render
   - Select Node.js environment

2. **Configure Environment**
   - Set all required environment variables
   - Configure PostgreSQL connection
   - Set JWT secrets

3. **Deploy**
   ```bash
   # Automatic deployment on git push to main
   git push origin main
   ```

### Mobile Deployment

**iOS (App Store)**
```bash
cd apps/mobile
eas build --platform ios
eas submit --platform ios
```

**Android (Google Play)**
```bash
cd apps/mobile
eas build --platform android
eas submit --platform android
```

See [DEPLOYMENT.md](./DEPLOYMENT.md) for detailed deployment instructions.

## 🔒 Security Features

- **JWT Authentication** - Secure token-based auth
- **Refresh Tokens** - Automatic token refresh
- **Secure Storage** - Tokens stored in secure device storage
- **Password Hashing** - bcrypt with salt
- **CORS Protection** - Configured CORS headers
- **Rate Limiting** - API endpoint rate limiting
- **HTTPS/TLS** - Production-grade encryption
- **Input Validation** - Joi schema validation
- **SQL Injection Prevention** - Parameterized queries

## 🔄 Scheduler & Background Jobs

The application uses BullMQ with Redis for background job processing:

**Price Checking** (Every 5 minutes)
- Fetches current prices from Duffel API
- Compares with baseline prices
- Triggers notifications if drop threshold met
- Updates price history in database

**Data Cleanup** (Daily)
- Archives old price history (>180 days)
- Removes inactive devices
- Purges expired refresh tokens

## 📊 Database Schema

### Core Tables
- **users** - User accounts with hashed passwords
- **devices** - Mobile devices registered for push notifications
- **trackers** - Flight price tracking configurations
- **price_history** - TimescaleDB hypertable for time-series price data

### Indexes
- user_id on devices, trackers
- tracker_id on price_history
- status on trackers for active tracker queries
- push_token on devices for notification delivery

## 🧪 Testing

### Backend Tests
```bash
cd apps/backend
npm test
```

### Mobile Tests
```bash
cd apps/mobile
npm test
```

## 📈 Performance Optimization

- **Database Indexes** - Optimized query performance
- **Connection Pooling** - Reused database connections
- **Response Compression** - gzip compression on all responses
- **Caching** - Redis caching for frequently accessed data
- **Async Processing** - Background jobs prevent blocking
- **Code Splitting** - Mobile app code splitting for faster loads
- **Bundle Optimization** - Minified production builds

## 🔐 Environment Variables

### Backend Required
```
NODE_ENV=production
PORT=3000
DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD
REDIS_HOST, REDIS_PORT, REDIS_PASSWORD
JWT_SECRET, JWT_REFRESH_SECRET
DUFFEL_API_KEY
CORS_ORIGIN
```

### Mobile Required
```
EXPO_PUBLIC_API_URL=https://api.yourdomain.com
EXPO_PUBLIC_ENV=production
```

See `.env.production` for all configuration options.

## 📊 Analytics & Monitoring

Integrate with:
- **Sentry** - Error tracking and performance monitoring
- **DataDog** - Infrastructure monitoring
- **Mixpanel** - User analytics
- **Timescale Cloud** - Database monitoring

## 🐛 Troubleshooting

### Backend Issues
```bash
# Check logs
docker logs flight-tracker-backend

# Test database
psql postgresql://user:password@host:5432/flight_tracker

# Test Redis
redis-cli ping
```

### Mobile Issues
```bash
# Clear cache
rm -rf node_modules .expo
npm install

# Rebuild
npm run build

# Check build logs
eas build:logs
```

## 📚 Documentation

- [Architecture Overview](./architecture.md) - System design
- [Development Guide](./DEVELOPMENT.md) - Development workflow
- [Deployment Guide](./DEPLOYMENT.md) - Production deployment
- [API Documentation](./API.md) - Detailed API reference

## 🤝 Contributing

1. Create feature branch: `git checkout -b feature/amazing-feature`
2. Commit changes: `git commit -m 'Add amazing feature'`
3. Push to branch: `git push origin feature/amazing-feature`
4. Open Pull Request

## 📝 License

This project is licensed under the MIT License - see LICENSE file for details.

## 🆘 Support

- **Issues**: GitHub Issues
- **Email**: support@flighttracker.app
- **Docs**: Full documentation in this repository

## 🚀 Roadmap

- [ ] Machine learning price prediction model
- [ ] Multi-city trip support
- [ ] Hotel price integration
- [ ] Car rental tracking
- [ ] Premium tier with advanced analytics
- [ ] Desktop web application
- [ ] Social features (share deals)
- [ ] Subscription management
- [ ] Payment integration

---

**Built with ❤️ for travelers**
