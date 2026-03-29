/**
 * Firestore store layer for inline comments.
 * Uses the global window.firestoreDb initialized in head/custom.html.
 * Real-time via onSnapshot, atomic likes via FieldValue.increment/arrayUnion.
 */
import type { Comment, Reply, NewComment, NewReply, AuthUser } from './types';
import { FIREBASE_CDN } from './utils';

/** Cached Firestore module — imported once, reused */
let cachedFs: Awaited<ReturnType<typeof loadFirestoreFns>> | null = null;

async function loadFirestoreFns() {
    const mod = await import(`${FIREBASE_CDN}/firebase-firestore.js`);
    return {
        collection: mod.collection,
        doc: mod.doc,
        query: mod.query,
        where: mod.where,
        orderBy: mod.orderBy,
        onSnapshot: mod.onSnapshot,
        addDoc: mod.addDoc,
        updateDoc: mod.updateDoc,
        getDocs: mod.getDocs,
        serverTimestamp: mod.serverTimestamp,
        increment: mod.increment,
        arrayUnion: mod.arrayUnion,
        arrayRemove: mod.arrayRemove,
    };
}

async function getFirestoreFns() {
    if (!cachedFs) cachedFs = await loadFirestoreFns();
    return cachedFs;
}

function getDb(): unknown {
    const db = (window as unknown as Record<string, unknown>).firestoreDb;
    if (!db) throw new Error('Firestore not initialized. Check head/custom.html.');
    return db;
}

/**
 * Subscribe to all comments for an article in real-time.
 * Returns an unsubscribe function.
 */
export async function subscribeComments(
    articleSlug: string,
    onUpdate: (comments: Comment[]) => void,
    onError?: (err: Error) => void,
): Promise<() => void> {
    const fs = await getFirestoreFns();
    const db = getDb();

    const q = fs.query(
        fs.collection(db, 'comments'),
        fs.where('articleSlug', '==', articleSlug),
        fs.orderBy('createdAt', 'asc'),
    );

    const unsubscribe = fs.onSnapshot(
        q,
        async (snapshot: { docs: Array<{ id: string; data: () => Record<string, unknown> }> }) => {
            // Build comments in parallel (fixes N+1 sequential reply fetches)
            const comments = await Promise.all(snapshot.docs.map(async (docSnap) => {
                const data = docSnap.data();
                const comment: Comment = {
                    id: docSnap.id,
                    articleSlug: data.articleSlug as string,
                    quotedText: data.quotedText as string,
                    text: data.text as string,
                    anchor: data.anchor as Comment['anchor'],
                    anchorStatus: (data.anchorStatus as Comment['anchorStatus']) ?? 'active',
                    author: data.author as Comment['author'],
                    createdAt: data.createdAt,
                    updatedAt: data.updatedAt,
                    likes: (data.likes as number) ?? 0,
                    likedBy: (data.likedBy as string[]) ?? [],
                    replyCount: (data.replyCount as number) ?? 0,
                    replies: [],
                };

                const repliesQuery = fs.query(
                    fs.collection(db, 'comments', docSnap.id, 'replies'),
                    fs.orderBy('createdAt', 'asc'),
                );
                const repliesSnap = await fs.getDocs(repliesQuery);
                comment.replies = repliesSnap.docs.map((r: { id: string; data: () => Record<string, unknown> }) => {
                    const rd = r.data();
                    return {
                        id: r.id,
                        author: rd.author as Reply['author'],
                        text: rd.text as string,
                        mentions: (rd.mentions as Reply['mentions']) ?? [],
                        createdAt: rd.createdAt,
                        updatedAt: rd.updatedAt,
                    };
                });

                return comment;
            }));

            onUpdate(comments);
        },
        (err: Error) => {
            console.error('[inline-comments] Firestore subscription error:', err);
            onError?.(err);
        },
    );

    return unsubscribe;
}

/**
 * Create a new comment thread.
 * Returns the new comment with optimistic ID.
 */
export async function createComment(data: NewComment, user: AuthUser): Promise<string> {
    console.log('[inline-comments] createComment called:', { slug: data.articleSlug, text: data.text, user: user.displayName });
    const fs = await getFirestoreFns();
    const db = getDb();
    console.log('[inline-comments] Firestore db:', db ? 'OK' : 'MISSING');

    const docRef = await fs.addDoc(fs.collection(db, 'comments'), {
        articleSlug: data.articleSlug,
        quotedText: data.quotedText,
        text: data.text,
        anchor: data.anchor,
        anchorStatus: 'active',
        author: {
            uid: user.uid,
            displayName: user.displayName,
            photoURL: user.photoURL,
        },
        createdAt: fs.serverTimestamp(),
        updatedAt: fs.serverTimestamp(),
        likes: 0,
        likedBy: [],
        replyCount: 0,
    });

    return docRef.id;
}

/** Add a reply to a comment thread. */
export async function createReply(commentId: string, data: NewReply, user: AuthUser): Promise<string> {
    const fs = await getFirestoreFns();
    const db = getDb();

    const docRef = await fs.addDoc(fs.collection(db, 'comments', commentId, 'replies'), {
        author: {
            uid: user.uid,
            displayName: user.displayName,
            photoURL: user.photoURL,
        },
        text: data.text,
        mentions: data.mentions,
        createdAt: fs.serverTimestamp(),
        updatedAt: fs.serverTimestamp(),
    });

    // Increment replyCount on parent comment (atomic)
    const commentRef = fs.doc(db, 'comments', commentId);
    await fs.updateDoc(commentRef, {
        replyCount: fs.increment(1),
    });

    return docRef.id;
}

/** Toggle like on a comment. Uses atomic operations to avoid race conditions. */
export async function toggleLike(commentId: string, uid: string, currentlyLiked: boolean): Promise<void> {
    const fs = await getFirestoreFns();
    const db = getDb();
    const commentRef = fs.doc(db, 'comments', commentId);

    if (currentlyLiked) {
        await fs.updateDoc(commentRef, {
            likes: fs.increment(-1),
            likedBy: fs.arrayRemove(uid),
        });
    } else {
        await fs.updateDoc(commentRef, {
            likes: fs.increment(1),
            likedBy: fs.arrayUnion(uid),
        });
    }
}
