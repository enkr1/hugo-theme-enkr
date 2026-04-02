/**
 * UI Rendering — Lark-style comment cards
 *
 * All DOM creation via createElement + textContent (zero innerHTML).
 * Matches the interactive mockup at docs/mockups/inline-comments-live.html.
 */
import type { Comment, Reply, AuthUser, NewReply } from './types';
import { createComment, createReply, toggleLike, deleteComment, deleteReply } from './store';
import { anchorComment, removeHighlight } from './anchoring';
import { initSelection } from './selection';
import type { CapturedSelection } from './selection';
import { el, text, timeAgo, truncate, avatarGradient, initials, rateLimit, HIGHLIGHT_CLASS, CARD_FOCUSED_CLASS } from './utils';
import { initPositioning, repositionCards, setComposerTargetTop } from './positioning';

declare global {
    interface Window {
        __siteAuth?: {
            initAuth: () => Promise<void>;
            signIn: () => Promise<void>;
            signOut: () => Promise<void>;
            onAuthStateChange: (cb: (user: { uid: string; displayName: string; photoURL: string } | null) => void) => () => void;
            getCurrentUser: () => { uid: string; displayName: string; photoURL: string } | null;
        };
    }
}

// Auth accessed via window.__siteAuth (cross-bundle shared state)
function getAuth() {
    return window.__siteAuth!;
}

// ─── State ───────────────────────────────────────────────────────
let comments: Comment[] = [];
let commentsLoaded = false;
let focusedCommentId: string | null = null;
let currentUser: AuthUser | null = null;
let composerData: { quotedText: string; anchor: { prefix: string; suffix: string }; selectionTop: number } | null = null;
let pendingReply: { commentId: string; text: string } | null = null;

// ─── DOM References ──────────────────────────────────────────────
let panelEl: HTMLElement | null = null;
let panelBodyEl: HTMLElement | null = null;
let composerEl: HTMLElement | null = null;
let commentsListEl: HTMLElement | null = null;
let badgeEl: HTMLElement | null = null;
let articleEl: HTMLElement | null = null;
let cleanupSelection: (() => void) | null = null;
let cleanupPositioning: (() => void) | null = null;
let cleanupAuth: (() => void) | null = null;
const anchoredIds = new Set<string>();

// ─── Public API ──────────────────────────────────────────────────

/** Initialize the UI. Call once after DOM is ready. */
export function initUI(rootEl: HTMLElement, articleContentEl: HTMLElement): void {
    articleEl = articleContentEl;
    buildPanel(rootEl);

    // Listen for auth state changes (store unsubscribe for cleanup)
    cleanupAuth = getAuth().onAuthStateChange((user) => {
        currentUser = user;
        renderAll();
    });

    // Init scroll-synced positioning (cards track highlight Y-offsets)
    if (panelBodyEl) {
        cleanupPositioning = initPositioning(panelBodyEl, articleContentEl);
    }

    // Init text selection popup
    cleanupSelection = initSelection(articleContentEl, onSelectionComment);
}

/** Update the comment list (called from Firestore onSnapshot). */
export function updateComments(newComments: Comment[]): void {
    comments = newComments;
    commentsLoaded = true;

    // Remove highlights for deleted comments, anchor new ones
    if (articleEl) {
        const currentIds = new Set(comments.map(c => c.id));
        for (const id of anchoredIds) {
            if (!currentIds.has(id)) {
                removeHighlight(id);
                anchoredIds.delete(id);
            }
        }
        for (const comment of comments) {
            if (anchoredIds.has(comment.id)) continue;
            const found = anchorComment(articleEl, comment);
            if (found) {
                anchoredIds.add(comment.id);
            }
        }
        attachHighlightClickHandlers();
    }

    // Sort by article position (mark element's DOM offset), unanchored comments last
    comments.sort((a, b) => {
        const markA = document.querySelector(`mark.${HIGHLIGHT_CLASS}[data-comment-id="${a.id}"]`) as HTMLElement | null;
        const markB = document.querySelector(`mark.${HIGHLIGHT_CLASS}[data-comment-id="${b.id}"]`) as HTMLElement | null;
        if (!markA && !markB) return 0;
        if (!markA) return 1;
        if (!markB) return -1;
        return markA.offsetTop - markB.offsetTop;
    });

    renderAll();
}

/** Cleanup all UI resources */
export function destroyUI(): void {
    cleanupSelection?.();
    cleanupPositioning?.();
    cleanupAuth?.();
    panelEl?.remove();
    panelEl = null;
    anchoredIds.clear();
}

// ─── Panel Construction ──────────────────────────────────────────

function buildPanel(rootEl: HTMLElement): void {
    panelEl = el('div', 'inline-comments-panel');

    // Header
    const header = el('div', 'ic-panel-header');
    const title = el('div', 'ic-panel-title');
    title.appendChild(text('Comments '));
    badgeEl = el('span', 'ic-badge');
    badgeEl.textContent = '0';
    title.appendChild(badgeEl);
    header.appendChild(title);
    panelEl.appendChild(header);

    // Body (scrollable, position: relative for absolute card positioning)
    panelBodyEl = el('div', 'ic-panel-body');

    // Composer (hidden by default)
    composerEl = buildComposer();
    panelBodyEl.appendChild(composerEl);

    // Comments list
    commentsListEl = el('div', 'ic-comments-list');
    panelBodyEl.appendChild(commentsListEl);

    panelEl.appendChild(panelBodyEl);
    rootEl.appendChild(panelEl);
}

// ─── Rendering ───────────────────────────────────────────────────

function renderAll(): void {
    if (!commentsListEl || !badgeEl) return;

    // Update badge
    badgeEl.textContent = String(comments.length);

    // Clear and re-render comments
    commentsListEl.textContent = '';

    // Before Firestore data arrives, show spinner
    if (!commentsLoaded) {
        commentsListEl.appendChild(buildLoadingState());
        return;
    }

    if (comments.length === 0 && !composerData) {
        commentsListEl.appendChild(buildEmptyState());
    }

    for (const comment of comments) {
        commentsListEl.appendChild(buildCommentCard(comment));
    }

    // Show/hide composer
    if (composerEl) {
        composerEl.style.display = composerData ? 'block' : 'none';
    }

    // Reposition cards + composer to match highlight Y-offsets
    repositionCards();
}

// ─── Comment Card ────────────────────────────────────────────────

function buildCommentCard(comment: Comment): HTMLElement {
    const isFocused = focusedCommentId === comment.id;
    const card = el('div', `ic-card${isFocused ? ' ic-card--focused' : ''}`);
    card.dataset.commentId = comment.id;
    card.addEventListener('click', () => focusComment(comment.id));

    // Card header: quoted text bar + controls
    card.appendChild(buildCardHeader(comment));

    // Master comment entry
    card.appendChild(buildCommentEntry(comment.author, comment.text, comment.createdAt, comment.id, comment.likes, comment.likedBy, comment.likedByNames));

    // Replies
    for (const reply of comment.replies) {
        card.appendChild(buildReplyEntry(reply, comment.id));
    }

    // Reply box (always shown — triggers sign-in for guests on interaction)
    card.appendChild(buildReplyBox(comment));

    return card;
}

function buildCardHeader(comment: Comment): HTMLElement {
    const header = el('div', 'ic-card-header');

    // Quoted text with gold bar
    const quotedBar = el('div', 'ic-quoted-bar');
    const quotedText = el('span', 'ic-quoted-text');
    quotedText.textContent = truncate(comment.quotedText, 60);
    quotedBar.appendChild(quotedText);
    header.appendChild(quotedBar);

    // Controls (visible on hover)
    const controls = el('div', 'ic-card-controls');

    const navUp = buildCtrlBtn('Previous', 'M7.41 15.41L12 10.83l4.59 4.58L18 14l-6-6-6 6z');
    navUp.addEventListener('click', (e) => { e.stopPropagation(); navigateComment(-1); });
    controls.appendChild(navUp);

    const navDown = buildCtrlBtn('Next', 'M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6z');
    navDown.addEventListener('click', (e) => { e.stopPropagation(); navigateComment(1); });
    controls.appendChild(navDown);

    const linkBtn = buildCtrlBtn('Copy link', 'M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z');
    controls.appendChild(linkBtn);

    header.appendChild(controls);
    return header;
}

function buildCtrlBtn(title: string, svgPath: string): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.className = 'ic-ctrl-btn';
    btn.title = title;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', '16');
    svg.setAttribute('height', '16');
    svg.setAttribute('fill', 'currentColor');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', svgPath);
    svg.appendChild(path);
    btn.appendChild(svg);
    return btn;
}

// ─── Comment / Reply Entry ───────────────────────────────────────

function buildCommentEntry(
    author: Comment['author'],
    bodyText: string,
    createdAt: unknown,
    commentId: string,
    likes: number,
    likedBy: string[],
    likedByNames: Record<string, string>,
): HTMLElement {
    const entry = el('div', 'ic-entry');

    // Avatar
    entry.appendChild(buildAvatar(author));

    // Content
    const content = el('div', 'ic-entry-content');

    // Meta row: name + timestamp + actions (Lark-style)
    const meta = el('div', 'ic-entry-meta');
    const name = el('span', 'ic-author-name');
    name.textContent = author.displayName;
    meta.appendChild(name);
    const time = el('span', 'ic-timestamp');
    time.textContent = timeAgo(createdAt);
    meta.appendChild(time);

    // Hover actions — inline in meta row
    const actions = el('div', 'ic-entry-actions');

    const isLiked = currentUser ? likedBy.includes(currentUser.uid) : false;

    // Like button
    const likeBtn = document.createElement('button');
    likeBtn.className = 'ic-action-btn' + (isLiked ? ' ic-action-btn--active' : '');
    likeBtn.textContent = '\uD83D\uDC4D';
    likeBtn.title = 'Like';
    likeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!currentUser) { getAuth().signIn(); return; }
        toggleLike(commentId, currentUser.uid, currentUser.displayName, isLiked);
    });
    actions.appendChild(likeBtn);

    // Reply button
    const replyBtn = document.createElement('button');
    replyBtn.className = 'ic-action-btn';
    replyBtn.textContent = '\uD83D\uDCAC';
    replyBtn.title = 'Reply';
    replyBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        focusComment(commentId);
        setTimeout(() => {
            const input = document.querySelector(`[data-reply-for="${commentId}"]`) as HTMLInputElement | null;
            input?.focus();
        }, 50);
    });
    actions.appendChild(replyBtn);

    // Delete button (own comments only)
    if (currentUser && currentUser.uid === author.uid) {
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'ic-action-btn ic-action-btn--danger';
        deleteBtn.textContent = '\uD83D\uDDD1\uFE0F';
        deleteBtn.title = 'Delete';
        deleteBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            if (!confirm('Delete this comment and all its replies?')) return;
            try { await deleteComment(commentId); } catch (err) {
                console.error('[inline-comments] Delete failed:', err);
            }
        });
        actions.appendChild(deleteBtn);
    }

    meta.appendChild(actions);
    content.appendChild(meta);

    // Text
    const textEl = el('div', 'ic-entry-text');
    textEl.textContent = bodyText;
    content.appendChild(textEl);

    // Likers list (Lark-style: 👍 Name1, Name2, ...)
    if (likes > 0) {
        const likerNames = Object.values(likedByNames);
        if (likerNames.length > 0) {
            const likersEl = el('div', 'ic-likers');
            const MAX_VISIBLE = 10;
            const visible = likerNames.slice(0, MAX_VISIBLE);
            const overflow = likerNames.length - MAX_VISIBLE;

            const thumbEl = el('span', 'ic-likers-thumb');
            thumbEl.textContent = '\uD83D\uDC4D';
            likersEl.appendChild(thumbEl);

            const namesEl = el('span', 'ic-likers-names');
            namesEl.textContent = visible.join(', ');
            likersEl.appendChild(namesEl);

            if (overflow > 0) {
                const moreEl = el('span', 'ic-likers-more');
                moreEl.textContent = ` +${overflow}`;
                moreEl.title = likerNames.slice(MAX_VISIBLE).join(', ');
                likersEl.appendChild(moreEl);
            }

            content.appendChild(likersEl);
        }
    }

    entry.appendChild(content);
    return entry;
}

function buildReplyEntry(reply: Reply, commentId: string): HTMLElement {
    const entry = el('div', 'ic-entry ic-reply');

    // Avatar
    entry.appendChild(buildAvatar(reply.author));

    // Content
    const content = el('div', 'ic-entry-content');

    const meta = el('div', 'ic-entry-meta');
    const name = el('span', 'ic-author-name');
    name.textContent = reply.author.displayName;
    meta.appendChild(name);
    const time = el('span', 'ic-timestamp');
    time.textContent = timeAgo(reply.createdAt);
    meta.appendChild(time);
    content.appendChild(meta);

    // Text with @mention rendering
    const textEl = el('div', 'ic-entry-text');
    renderTextWithMentions(textEl, reply.text, reply.mentions);
    content.appendChild(textEl);

    entry.appendChild(content);

    // Delete button (own replies only)
    if (currentUser && currentUser.uid === reply.author.uid) {
        const actions = el('div', 'ic-entry-actions');
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'ic-action-btn ic-action-btn--danger';
        deleteBtn.textContent = '\uD83D\uDDD1\uFE0F';
        deleteBtn.title = 'Delete reply';
        deleteBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            if (!confirm('Delete this reply?')) return;
            try { await deleteReply(commentId, reply.id); } catch (err) {
                console.error('[inline-comments] Delete reply failed:', err);
            }
        });
        actions.appendChild(deleteBtn);
        entry.appendChild(actions);
    }

    return entry;
}

function buildAvatar(author: { uid: string; displayName: string; photoURL?: string }): HTMLElement {
    const avatar = el('div', 'ic-avatar');
    if (author.photoURL) {
        const img = document.createElement('img');
        img.src = author.photoURL;
        img.alt = author.displayName;
        img.className = 'ic-avatar-img';
        img.addEventListener('error', () => {
            img.remove();
            avatar.style.background = avatarGradient(author.uid);
            avatar.textContent = initials(author.displayName);
        });
        avatar.appendChild(img);
    } else {
        avatar.style.background = avatarGradient(author.uid);
        avatar.textContent = initials(author.displayName);
    }
    return avatar;
}

// ─── @Mention Rendering ──────────────────────────────────────────

function renderTextWithMentions(
    container: HTMLElement,
    bodyText: string,
    mentions: Array<{ uid: string; displayName: string }>,
): void {
    if (!mentions.length) {
        container.textContent = bodyText;
        return;
    }

    let remaining = bodyText;
    for (const mention of mentions) {
        const pattern = `@${mention.displayName}`;
        const idx = remaining.indexOf(pattern);
        if (idx === -1) continue;

        // Text before mention
        if (idx > 0) {
            container.appendChild(text(remaining.substring(0, idx)));
        }

        // Mention pill
        const pill = el('span', 'ic-mention');
        pill.textContent = pattern;
        container.appendChild(pill);

        remaining = remaining.substring(idx + pattern.length);
    }

    // Remaining text after last mention
    if (remaining) {
        container.appendChild(text(remaining));
    }
}

// ─── Reply Box ───────────────────────────────────────────────────

function buildReplyBox(comment: Comment): HTMLElement {
    const box = el('div', 'ic-reply-box');
    box.addEventListener('click', (e) => e.stopPropagation());

    // Mention dropdown (hidden by default)
    const dropdown = el('div', 'ic-mention-dropdown');
    dropdown.dataset.commentId = comment.id;
    box.appendChild(dropdown);

    // Input
    const input = document.createElement('input');
    input.className = 'ic-reply-input';
    input.placeholder = 'Reply';
    input.dataset.replyFor = comment.id;

    // Restore pending reply text after sign-in re-render
    if (pendingReply?.commentId === comment.id) {
        input.value = pendingReply.text;
        pendingReply = null;
        setTimeout(() => input.focus(), 50);
    }

    let mentionState: { active: boolean; atIdx: number; participants: Array<{ uid: string; displayName: string }> } = {
        active: false, atIdx: -1, participants: [],
    };

    input.addEventListener('input', () => {
        handleMentionInput(input, dropdown, comment, mentionState);
    });

    input.addEventListener('keydown', (e) => {
        if (mentionState.active && dropdown.style.display !== 'none') {
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === 'Escape') {
                handleMentionKeydown(e, input, dropdown, comment, mentionState);
                return;
            }
        }
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            submitReply(comment.id, input);
        }
    });

    box.appendChild(input);

    // Send button
    const sendBtn = document.createElement('button');
    sendBtn.className = 'ic-send-btn';
    sendBtn.title = 'Send';
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', '18');
    svg.setAttribute('height', '18');
    svg.setAttribute('fill', 'currentColor');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M2.01 21L23 12 2.01 3 2 10l15 2-15 2z');
    svg.appendChild(path);
    sendBtn.appendChild(svg);
    sendBtn.addEventListener('click', () => submitReply(comment.id, input));
    box.appendChild(sendBtn);

    return box;
}

async function submitReply(commentId: string, input: HTMLInputElement): Promise<void> {
    const replyText = input.value.trim();
    if (!replyText) return;
    if (!currentUser) {
        pendingReply = { commentId, text: replyText };
        getAuth().signIn();
        return;
    }
    if (!rateLimit('reply', 10000)) return;

    // Parse mentions from text
    const mentions: NewReply['mentions'] = [];
    const comment = comments.find(c => c.id === commentId);
    if (comment) {
        const participants = getThreadParticipants(comment);
        for (const p of participants) {
            if (replyText.includes(`@${p.displayName}`)) {
                mentions.push({ uid: p.uid, displayName: p.displayName });
            }
        }
    }

    input.value = '';
    input.disabled = true;

    try {
        await createReply(commentId, { text: replyText, mentions }, currentUser);
    } catch (err) {
        console.error('[inline-comments] Reply failed:', err);
        input.value = replyText; // restore on failure
    } finally {
        input.disabled = false;
    }
}

// ─── @Mention Dropdown ───────────────────────────────────────────

function getThreadParticipants(comment: Comment): Array<{ uid: string; displayName: string }> {
    const seen = new Set<string>();
    const result: Array<{ uid: string; displayName: string }> = [];

    const addIfNew = (author: { uid: string; displayName: string }) => {
        if (!seen.has(author.uid) && author.uid !== currentUser?.uid) {
            seen.add(author.uid);
            result.push(author);
        }
    };

    addIfNew(comment.author);
    for (const reply of comment.replies) addIfNew(reply.author);
    return result;
}

function handleMentionInput(
    input: HTMLInputElement,
    dropdown: HTMLElement,
    comment: Comment,
    state: { active: boolean; atIdx: number; participants: Array<{ uid: string; displayName: string }> },
): void {
    const val = input.value;
    const pos = input.selectionStart ?? val.length;
    const before = val.substring(0, pos);
    const atIdx = before.lastIndexOf('@');

    if (atIdx >= 0 && (atIdx === 0 || before[atIdx - 1] === ' ')) {
        const query = before.substring(atIdx + 1).toLowerCase();
        const participants = getThreadParticipants(comment);
        const filtered = participants.filter(p => p.displayName.toLowerCase().includes(query));

        if (filtered.length > 0) {
            state.active = true;
            state.atIdx = atIdx;
            state.participants = filtered;
            renderMentionDropdown(dropdown, filtered, (name) => insertMention(input, dropdown, name, atIdx, state));
            dropdown.style.display = 'block';
            return;
        }
    }

    state.active = false;
    dropdown.style.display = 'none';
}

function handleMentionKeydown(
    e: KeyboardEvent,
    input: HTMLInputElement,
    dropdown: HTMLElement,
    _comment: Comment,
    state: { active: boolean; atIdx: number; participants: Array<{ uid: string; displayName: string }> },
): void {
    const options = dropdown.querySelectorAll('.ic-mention-option');
    let selectedIdx = Array.from(options).findIndex(o => o.classList.contains('selected'));

    if (e.key === 'ArrowDown') {
        e.preventDefault();
        selectedIdx = Math.min(selectedIdx + 1, options.length - 1);
    } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        selectedIdx = Math.max(selectedIdx - 1, 0);
    } else if (e.key === 'Enter') {
        e.preventDefault();
        const selected = state.participants[selectedIdx];
        if (selected) insertMention(input, dropdown, selected.displayName, state.atIdx, state);
        return;
    } else if (e.key === 'Escape') {
        state.active = false;
        dropdown.style.display = 'none';
        return;
    }

    options.forEach((o, i) => o.classList.toggle('selected', i === selectedIdx));
}

function renderMentionDropdown(
    dropdown: HTMLElement,
    participants: Array<{ uid: string; displayName: string }>,
    onSelect: (name: string) => void,
): void {
    dropdown.textContent = '';

    const header = el('div', 'ic-mention-header');
    header.textContent = 'People in this thread';
    dropdown.appendChild(header);

    participants.forEach((p, i) => {
        const option = el('div', `ic-mention-option${i === 0 ? ' selected' : ''}`);
        option.appendChild(buildAvatar(p));
        const name = el('span');
        name.textContent = p.displayName;
        option.appendChild(name);
        option.addEventListener('click', (e) => {
            e.stopPropagation();
            onSelect(p.displayName);
        });
        dropdown.appendChild(option);
    });
}

function insertMention(
    input: HTMLInputElement,
    dropdown: HTMLElement,
    displayName: string,
    atIdx: number,
    state: { active: boolean },
): void {
    const val = input.value;
    const pos = input.selectionStart ?? val.length;
    const before = val.substring(0, atIdx);
    const after = val.substring(pos);
    input.value = `${before}@${displayName} ${after}`;
    const newPos = atIdx + displayName.length + 2;
    input.setSelectionRange(newPos, newPos);
    input.focus();
    state.active = false;
    dropdown.style.display = 'none';
}

// ─── Composer ────────────────────────────────────────────────────

function buildComposer(): HTMLElement {
    const composer = el('div', 'ic-composer');
    composer.style.display = 'none';
    return composer;
}

function renderComposer(): void {
    if (!composerEl || !composerData) return;
    composerEl.textContent = '';

    // Header with quoted text
    const header = el('div', 'ic-card-header');
    const quotedBar = el('div', 'ic-quoted-bar');
    const quotedText = el('span', 'ic-quoted-text');
    quotedText.textContent = truncate(composerData.quotedText, 60);
    quotedBar.appendChild(quotedText);
    header.appendChild(quotedBar);
    composerEl.appendChild(header);

    // Author row
    if (currentUser) {
        const authorRow = el('div', 'ic-entry');
        authorRow.appendChild(buildAvatar(currentUser));
        const name = el('span', 'ic-author-name');
        name.textContent = currentUser.displayName;
        authorRow.appendChild(name);
        composerEl.appendChild(authorRow);
    }

    // Textarea
    const body = el('div', 'ic-composer-body');
    const textarea = document.createElement('textarea');
    textarea.className = 'ic-composer-textarea';
    textarea.placeholder = 'Add a comment...';
    textarea.rows = 3;
    body.appendChild(textarea);

    // Buttons
    const footer = el('div', 'ic-composer-footer');
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'ic-btn ic-btn--ghost';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', cancelCompose);
    footer.appendChild(cancelBtn);

    const submitBtn = document.createElement('button');
    submitBtn.className = 'ic-btn ic-btn--primary';
    submitBtn.textContent = 'Comment';
    submitBtn.disabled = true;

    textarea.addEventListener('input', () => {
        submitBtn.disabled = !textarea.value.trim();
    });

    submitBtn.addEventListener('click', async () => {
        const commentText = textarea.value.trim();
        if (!commentText || !composerData || !currentUser) return;
        if (!rateLimit('comment', 10000)) return;

        submitBtn.disabled = true;
        textarea.disabled = true;

        try {
            const slug = document.getElementById('inline-comments-root')?.dataset.articleSlug;
            if (!slug) throw new Error('No article slug');

            await createComment(
                {
                    articleSlug: slug,
                    quotedText: composerData.quotedText,
                    text: commentText,
                    anchor: composerData.anchor,
                },
                currentUser,
            );
            cancelCompose();
        } catch (err) {
            console.error('[inline-comments] Create comment failed:', err);
            submitBtn.disabled = false;
            textarea.disabled = false;
        }
    });

    footer.appendChild(submitBtn);
    body.appendChild(footer);
    composerEl.appendChild(body);

    // Auto-focus
    setTimeout(() => textarea.focus(), 50);
}

function cancelCompose(): void {
    composerData = null;
    setComposerTargetTop(null);
    if (composerEl) composerEl.style.display = 'none';
    renderAll();
}

// ─── Selection → Compose Flow ────────────────────────────────────

async function onSelectionComment(captured: CapturedSelection): Promise<void> {
    // Selection data was pre-captured when the popup appeared (not on click)
    // so it's always valid even if the browser selection was cleared

    // Ensure signed in
    if (!currentUser) {
        await getAuth().signIn();
        // Auth state updates via onAuthStateChange listener — return and let
        // the user retry after sign-in completes
        return;
    }

    // Open composer with pre-captured data, positioned at selection Y
    composerData = captured;
    setComposerTargetTop(captured.selectionTop);
    if (composerEl) {
        composerEl.style.display = 'block';
        renderComposer();
        repositionCards();
    }
}

// ─── Loading, Empty & Sign-In States ────────────────────────────

function buildLoadingState(): HTMLElement {
    const wrap = el('div', 'ic-loading');
    wrap.appendChild(el('div', 'ic-spinner'));
    const msg = el('p', 'ic-loading-text');
    msg.textContent = 'Loading\u2026';
    wrap.appendChild(msg);
    return wrap;
}

function buildEmptyState(): HTMLElement {
    const empty = el('div', 'ic-empty');
    const icon = el('div', 'ic-empty-icon');
    icon.textContent = '\uD83D\uDCAC';
    empty.appendChild(icon);
    const msg = el('p', 'ic-empty-text');
    msg.textContent = 'No comments yet';
    empty.appendChild(msg);
    const sub = el('p', 'ic-empty-sub');
    sub.textContent = 'Select text to start a conversation';
    empty.appendChild(sub);
    return empty;
}

// ─── Navigation & Focus ──────────────────────────────────────────

function focusComment(commentId: string): void {
    focusedCommentId = commentId;

    // Toggle card focus class (no full rebuild)
    panelBodyEl?.querySelector(`.${CARD_FOCUSED_CLASS}`)?.classList.remove(CARD_FOCUSED_CLASS);
    const card = panelBodyEl?.querySelector(`[data-comment-id="${commentId}"]`);
    card?.classList.add(CARD_FOCUSED_CLASS);
    card?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    // Toggle highlight active class
    document.querySelectorAll(`mark.${HIGHLIGHT_CLASS}.active`).forEach(m => m.classList.remove('active'));
    const marks = document.querySelectorAll(`mark.${HIGHLIGHT_CLASS}[data-comment-id="${commentId}"]`);
    marks.forEach(m => {
        m.classList.add('active');
        m.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
}

function navigateComment(direction: number): void {
    if (comments.length === 0) return;
    const currentIdx = comments.findIndex(c => c.id === focusedCommentId);
    let nextIdx = currentIdx + direction;
    if (nextIdx < 0) nextIdx = comments.length - 1;
    if (nextIdx >= comments.length) nextIdx = 0;
    focusComment(comments[nextIdx]!.id);
}

function attachHighlightClickHandlers(): void {
    const marks = document.querySelectorAll(`mark.inline-comment-hl`);
    for (const mark of marks) {
        const commentId = (mark as HTMLElement).dataset.commentId;
        if (!commentId) continue;
        // Avoid duplicate listeners by checking a flag
        if ((mark as HTMLElement).dataset.listenerAttached) continue;
        (mark as HTMLElement).dataset.listenerAttached = '1';
        mark.addEventListener('click', () => focusComment(commentId));
    }
}
