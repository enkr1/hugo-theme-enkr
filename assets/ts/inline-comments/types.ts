/** Inline Comments — Type Definitions */

export interface Author {
    uid: string;
    displayName: string;
    photoURL: string;
}

export interface Anchor {
    prefix: string;   // ~30 chars before selection
    suffix: string;   // ~30 chars after selection
}

export interface Comment {
    id: string;                          // Firestore auto-generated
    articleSlug: string;
    quotedText: string;
    text: string;
    anchor: Anchor;
    anchorStatus: 'active' | 'orphaned';
    author: Author;
    createdAt: unknown;                  // Firestore Timestamp
    updatedAt: unknown;                  // Firestore Timestamp
    likes: number;
    likedBy: string[];
    replyCount: number;
    replies: Reply[];                    // populated client-side from subcollection
}

export interface Reply {
    id: string;
    author: Author;
    text: string;
    mentions: Array<{ uid: string; displayName: string }>;
    createdAt: unknown;
    updatedAt: unknown;
}

export interface NewComment {
    articleSlug: string;
    quotedText: string;
    text: string;
    anchor: Anchor;
}

export interface NewReply {
    text: string;
    mentions: Array<{ uid: string; displayName: string }>;
}

/** Auth state passed around the UI */
export interface AuthUser {
    uid: string;
    displayName: string;
    photoURL: string;
}
