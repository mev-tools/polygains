src/
├── context/
│   ├── AuthContext.tsx       // Combines Reducer + Provider
│   └── ThemeContext.tsx
├── reducers/
│   ├── authReducer.ts        // Pure logic for state changes
│   └── themeReducer.ts
├── hooks/
│   ├── useUser.ts            // SWR-based data fetching hook
│   └── useProjects.ts        // SWR-based data fetching hook
└── components/
    └── Profile.tsx           // Consumes both Context and SWR hooks
