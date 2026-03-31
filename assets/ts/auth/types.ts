// themes/stack/assets/ts/auth/types.ts

/** Auth state passed around the UI */
export interface AuthUser {
    uid: string;
    displayName: string;
    photoURL: string;
}

export type AuthStateCallback = (user: AuthUser | null) => void;
