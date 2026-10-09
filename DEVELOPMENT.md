# Flight Tracker - Development Guide

## 📦 What's Been Built

This is a complete end-to-end scaffolding for a native mobile app with backend API. All core systems are in place and ready for development.

### Backend (Node.js/Express/TypeScript)
✅ Express server with middleware (auth, CORS, compression, logging)
✅ Database layer with PostgreSQL + TimescaleDB
✅ JWT authentication (signup, login, refresh)
✅ Tracker CRUD operations (create, read, update, delete, pause, resume)
✅ Type-safe database queries
✅ Environment configuration
✅ Error handling & validation (Joi)
✅ Docker & Docker Compose setup
✅ GitHub Actions CI/CD pipelines

### Mobile App (React Native/Expo/TypeScript)
✅ Expo SDK 57 with native compilation
✅ React Navigation setup (ready for screens)
✅ Zustand state management (auth + tracker stores)
✅ API client with axios + token refresh
✅ Secure token storage (expo-secure-store)
✅ TypeScript throughout
✅ Push notifications support (expo-notifications)
✅ EAS Build configuration
✅ App Store & Google Play submission ready

### Shared Infrastructure
✅ Monorepo setup with npm workspaces
✅ Unified package.json commands
✅ TypeScript configuration
✅ .gitignore and environment templates
✅ Comprehensive README and documentation

---

## 🚀 Next Steps to Complete the App

### Phase 1: Core Features (1-2 weeks)
1. **Build screens:**
   - [ ] Login/Signup screens
   - [ ] Dashboard (tracker list)
   - [ ] Create Tracker form
   - [ ] Tracker detail view
   - [ ] Settings/Account screen

2. **Implement features:**
   - [ ] Push notification handling
   - [ ] Offline persistence (AsyncStorage)
   - [ ] Price chart component
   - [ ] Trend calculation & display

3. **Backend services:**
   - [ ] Price Fetch Service (Duffel API integration)
   - [ ] Device Service (push token management)
   - [ ] Notification Service (push + email)
   - [ ] Scheduler (BullMQ job queue)

### Phase 2: Advanced Features (2-3 weeks)
1. **Backend:**
   - [ ] Price history analysis (TimescaleDB queries)
   - [ ] Trend calculation (percentile, slope)
   - [ ] Prediction service
   - [ ] Email notifications (SendGrid)
   - [ ] Retry logic & fallback mechanisms

2. **Mobile:**
   - [ ] Background sync (BGTaskScheduler/WorkManager)
   - [ ] Deep linking for notifications
   - [ ] Analytics integration
   - [ ] Error reporting (Sentry)

### Phase 3: Testing & Deployment (1-2 weeks)
1. **Testing:**
   - [ ] Backend unit tests
   - [ ] Backend integration tests
   - [ ] Mobile component tests

2. **Deployment:**
   - [ ] Set up Timescale Cloud database
   - [ ] Configure Upstash Redis
   - [ ] Deploy backend to Render/AWS
   - [ ] Build & submit to EAS
   - [ ] Submit to App Store & Google Play

---

## 💡 Architecture Quick Reference

### Database
```
Users → Trackers → Alerts & Devices
                ↓
          price_history (TimescaleDB hypertable)
```

### API Flow
```
Mobile App → Express API → Auth/Tracker Services → PostgreSQL
                              ↓
                         Price Fetch Service → Duffel API
                              ↓
                         Notification Service → Push/Email
```

### State Management
```
Mobile App
├── useAuthStore (Zustand)
│   └── user, tokens, login, logout, checkAuth
├── useTrackerStore (Zustand)
│   └── trackers[], selectedTracker, crud operations
└── React Query (for API requests)
```

---

## 🔧 Common Tasks

### Add a new backend route
1. Create handler in `apps/backend/src/routes/new-feature.routes.ts`
2. Import in `apps/backend/src/app.ts`
3. Add `app.use('/api/new-feature', newFeatureRoutes)`
4. Test with curl or Postman

### Add a new mobile screen
1. Create component in `apps/mobile/src/screens/NewScreen.tsx`
2. Add navigation in `apps/mobile/src/navigation/Navigation.tsx`
3. Connect store with `useTrackerStore()` / `useAuthStore()`
4. Test in Expo

### Add a new service
1. Create `apps/backend/src/services/new-service.ts`
2. Implement functions and export
3. Use in routes via `import * as newService from '@/services/new-service.js'`

### Connect API endpoint to mobile
1. Add function in `apps/mobile/src/services/tracker.ts` (or new file)
2. Call in store action `apps/mobile/src/store/tracker.ts`
3. Use hook in component: `const { trackers } = useTrackerStore()`

---

## 📊 Environment Setup Checklist

- [ ] Create `.env` in `apps/backend/` from `.env.example`
- [ ] Add API keys (Duffel, SendGrid, Expo)
- [ ] Start Docker: `docker-compose up -d`
- [ ] Run migrations: `npm run db:setup`
- [ ] Start backend: `npm run backend`
- [ ] Start mobile: `npm run mobile`
- [ ] Test auth flow in mobile app
- [ ] Create test tracker via UI

---

## 🐛 Debugging

### Backend Issues
```bash
# Check logs
docker-compose logs -f backend

# Test database
docker-compose exec postgres psql -U postgres -d flight_tracker -c "SELECT * FROM users;"

# Test API
curl http://localhost:3000/health
```

### Mobile Issues
```bash
# Check Expo bundler
npm run mobile -- --verbose

# Clear Expo cache
expo start -c

# Check device logs
expo logs
```

---

## 📚 Key Files to Know

- **Backend entry**: `apps/backend/src/index.ts`
- **Backend app**: `apps/backend/src/app.ts`
- **Database setup**: `apps/backend/src/db/setup.ts`
- **Auth service**: `apps/backend/src/services/auth.service.ts`
- **Tracker service**: `apps/backend/src/services/tracker.service.ts`
- **Mobile entry**: `apps/mobile/App.tsx` (will be created)
- **Auth store**: `apps/mobile/src/store/auth.ts`
- **Tracker store**: `apps/mobile/src/store/tracker.ts`
- **API client**: `apps/mobile/src/services/api.ts`

---

## 🔗 External APIs

- **Duffel**: Flight search API (docs at duffel.com)
- **Expo Push**: Native notifications
- **SendGrid**: Email fallback
- **TimescaleDB**: Time-series data
- **BullMQ**: Job queue for price polling

---

## 🎯 Success Metrics

Phase 1 Complete:
- Users can sign up, login
- Create and view price trackers
- App displays live prices from Duffel API
- Receive push notifications on price drops

Phase 2 Complete:
- Price history charts show trends
- Background sync updates prices
- Email notifications work as fallback
- High reliability & performance

Phase 3 Complete:
- App live on App Store & Google Play
- Backend running on production servers
- Database on Timescale Cloud
- Cache on Upstash
- <100ms API latency
- <3s notification delivery

---

Good luck building! 🚀
