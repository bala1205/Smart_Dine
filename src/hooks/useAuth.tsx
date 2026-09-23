import { useEffect, useState, createContext, useContext, ReactNode } from "react";
import { onAuthStateChanged, User } from "firebase/auth";
import { doc, getDoc, onSnapshot, Unsubscribe } from "firebase/firestore";
import { auth, db } from "../lib/firebase";
import type { UserProfile } from "../types/auth";

interface AuthState {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
}

const AuthContext = createContext<AuthState>({ user: null, profile: null, loading: true });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubProfile: Unsubscribe | null = null;
    const unsubAuth = onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (unsubProfile) unsubProfile();
      if (u) {
        unsubProfile = onSnapshot(doc(db, "users", u.uid), (snap) => {
          if (snap.exists()) {
            setProfile({ ...(snap.data() as UserProfile), uid: snap.id });
          } else {
            setProfile(null);
          }
          setLoading(false);
        });
      } else {
        setProfile(null);
        setLoading(false);
      }
    });
    return () => {
      unsubAuth();
      if (unsubProfile) unsubProfile();
    };
  }, []);

  return (
    <AuthContext.Provider value={{ user, profile, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
