/**
 * KIIT Events – Chat System Module
 * Connects frontend to Supabase: chats, contents, chat_members, profiles tables
 * Storage bucket: chat-files
 */

// ── Emoji list ──────────────────────────────────────────────
export const EMOJIS = [
    '😀', '😂', '😍', '🥰', '😎', '🤔', '😅', '🤩', '😭', '😡',
    '👍', '👎', '❤️', '🔥', '✅', '🎉', '🙏', '💯', '⚡', '🚀',
    '📢', '📌', '⭐', '🔒', '📎', '🖼️', '📁', '💬', '🔔', '🎓',
    '😊', '😇', '🤗', '🤭', '🫡', '🥹', '😤', '🫶', '👏', '🙌',
    '🤝', '💪', '🖐️', '👋', '✌️', '🤞', '💥', '💫', '✨', '🎯',
    '🏆', '🎓', '📚', '💡', '🔑', '🎵', '🎉', '🎊', '🌟', '💎'
];

// ── Format helpers ───────────────────────────────────────────
export function formatTime(isoString) {
    if (!isoString) return '';
    const d = new Date(isoString);
    return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
}

export function formatDate(isoString) {
    if (!isoString) return '';
    const d = new Date(isoString);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    if (d.toDateString() === today.toDateString()) return 'Today';
    if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatFileSize(bytes) {
    if (!bytes) return '';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
}

export function getInitials(name) {
    if (!name) return '?';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

/** No-op passthrough — we don't encrypt contents, but student-dashboard.html calls this */
export async function decryptMessage(content, iv, roomId) {
    return content || '';
}

function escHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str).replace(/[&<>"']/g, m => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[m]));
}

// ── ChatManager ──────────────────────────────────────────────
export class ChatManager {
    constructor(supabase, userId, userRole, userName) {
        this.sb = supabase;
        this.userId = userId;
        this.userRole = userRole;
        this.userName = userName;
        this._subs = [];
        this._typingTimeouts = {};
        this._presenceChannel = null;
        this._onlineUsers = new Set();
    }

    // ── Chat Operations ────────────────────────────────────────

    /** Create a new chat (private or group) */
    async createChat(name, type, memberIds = [], avatarUrl = null, description = '') {
        const { data: chat, error: chatError } = await this.sb
            .from('chat_rooms')
            .insert({
                name: name || null,
                type,
                created_by: this.userId,
                avatar_url: avatarUrl,
                description: description || null
            })
            .select()
            .single();

        if (chatError) throw chatError;

        // Add creator as admin + other members
        const uniqueMemberIds = [...new Set([...memberIds])].filter(uid => uid !== this.userId);
        const members = [
            { room_id: chat.id, user_id: this.userId, role: 'admin' },
            ...uniqueMemberIds.map(uid => ({ room_id: chat.id, user_id: uid, role: 'member' }))
        ];

        const { error: memError } = await this.sb.from('chat_room_members').insert(members);
        if (memError) throw memError;

        return chat;
    }

    /** Alias for createChat (student dashboard compatibility) */
    async createRoom(name, type, memberIds = []) {
        return this.createChat(name, type, memberIds);
    }

    /** Get or create a direct (private) chat with another user */
    async getOrCreateDirectChatHifi(otherUserId) {
        if (!otherUserId) throw new Error('otherUserId is required');

        // Try to find existing direct chat between the two users
        const { data: myMemberships } = await this.sb
            .from('chat_room_members')
            .select('room_id')
            .eq('user_id', this.userId);

        const myIds = (myMemberships || []).map(m => m.room_id);

        if (myIds.length > 0) {
            const { data: sharedChats } = await this.sb
                .from('chat_room_members')
                .select('room_id, chat_rooms(id, type)')
                .eq('user_id', otherUserId)
                .in('room_id', myIds);

            const directChat = (sharedChats || []).find(m => m.chat_rooms?.type === 'private' || m.chat_rooms?.type === 'direct');
            if (directChat?.room_id) {
                const { data: existingChat } = await this.sb
                    .from('chat_rooms')
                    .select('*')
                    .eq('id', directChat.room_id)
                    .single();
                if (existingChat) return existingChat;
            }
        }

        // Fetch the other user's profile
        const { data: otherProfile } = await this.sb
            .from('profiles')
            .select('full_name, avatar_url')
            .eq('id', otherUserId)
            .single();

        return await this.createChat(
            otherProfile?.full_name || 'Direct Message',
            'private',
            [otherUserId],
            otherProfile?.avatar_url || null
        );
    }

    /** Get all chats the current user is a member of, with last message */
    async getMyChats() {
        const { data, error } = await this.sb
            .from('chat_room_members')
            .select(`
                room_id,
                role,
                chat_rooms(
                    id,
                    name,
                    type,
                    created_by,
                    created_at,
                    avatar_url,
                    description
                )
            `)
            .eq('user_id', this.userId)
            .order('joined_at', { ascending: false });

        if (error) {
            console.error('getMyChats error:', error);
            return [];
        }

        const chats = (data || [])
            .filter(m => m.chat_rooms)
            .map(m => ({ ...m.chat_rooms, myRole: m.role }));

        // Fetch last message for each chat
        for (const chat of chats) {
            const { data: lastMsgArr } = await this.sb
                .from('chat_messages')
                .select('content, file_url, created_at, sender_id')
                .eq('room_id', chat.id)
                .order('created_at', { ascending: false })
                .limit(1);

            chat.lastMessage = lastMsgArr?.[0] || null;
        }

        // Sort by last message time
        chats.sort((a, b) => {
            const ta = a.lastMessage?.created_at || a.created_at;
            const tb = b.lastMessage?.created_at || b.created_at;
            return new Date(tb) - new Date(ta);
        });

        return chats;
    }

    /** Alias for getMyChats (student dashboard compatibility) */
    async getMyRooms(role) {
        return this.getMyChats();
    }

    /** Search users by name or email */
    async searchUsers(query, limit = 10) {
        if (!query || query.length < 1) return [];
        const { data, error } = await this.sb
            .from('profiles')
            .select('id, full_name, email, role, avatar_url')
            .or(`full_name.ilike.%${query}%,email.ilike.%${query}%`)
            .neq('id', this.userId)
            .limit(limit);

        if (error) {
            console.error('searchUsers error:', error);
            return [];
        }
        return data || [];
    }

    /** Alias for searchUsers (student dashboard compat) */
    async searchUsersByEmail(query) {
        return this.searchUsers(query);
    }

    // ── Message Operations ─────────────────────────────────────

    /** Send a text message */
    async sendMessageHifi(chatId, text, type = 'text', fileUrl = null) {
        if (!chatId) throw new Error('chatId is required');
        if (!text && !fileUrl) throw new Error('message or fileUrl is required');

        const { data, error } = await this.sb
            .from('chat_messages')
            .insert({
                room_id: chatId,
                sender_id: this.userId,
                content: text || null,
                file_url: fileUrl || null
            })
            .select()
            .single();

        if (error) throw error;

        // Trigger AI Assistant if the chat is configured for it
        if (!fileUrl) { // Only trigger AI on text contents
            this.sb.from('chat_rooms').select('is_ai_active').eq('id', chatId).single().then(({ data: chatData }) => {
                if (chatData?.is_ai_active && text) {
                    this.sb.functions.invoke('chat-assistant', {
                        body: { chatId, content: text }
                    }).catch(err => console.error("AI Edge Function Error:", err));
                }
            }).catch(console.error);
        }

        return data;
    }

    /** Alias for sendMessageHifi (student compat) */
    async sendMessage(chatId, text, type = 'text') {
        return this.sendMessageHifi(chatId, text, type);
    }

    /** Upload a file to Supabase Storage and send as message */
    async uploadAndSendFile(chatId, file) {
        if (!chatId || !file) throw new Error('chatId and file are required');

        const ext = file.name.split('.').pop();
        const filePath = `chat/${chatId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

        const { data: uploadData, error: uploadError } = await this.sb.storage
            .from('chat-files')
            .upload(filePath, file, { cacheControl: '3600', upsert: false });

        if (uploadError) throw uploadError;

        const { data: urlData } = this.sb.storage
            .from('chat-files')
            .getPublicUrl(uploadData.path);

        const publicUrl = urlData.publicUrl;

        const { data, error } = await this.sb
            .from('chat_messages')
            .insert({
                room_id: chatId,
                sender_id: this.userId,
                content: file.name,
                file_url: publicUrl
            })
            .select()
            .single();

        if (error) throw error;
        return data;
    }

    /** Alias for uploadAndSendFile (student compat) */
    async sendFileMessage(chatId, file) {
        return this.uploadAndSendFile(chatId, file);
    }

    /** Load content history for a chat */
    async loadMessagesHifi(chatId, limit = 60) {
        if (!chatId) return [];

        const { data, error } = await this.sb
            .from('chat_messages')
            .select(`
                *,
                profiles:sender_id ( id, full_name, avatar_url, role ),
                chat_message_reactions ( emoji, user_id )
            `)
            .eq('room_id', chatId)
            .order('created_at', { ascending: true })
            .limit(limit);

        if (error) {
            console.error('loadMessagesHifi error:', error);
            return [];
        }
        return data || [];
    }

    /** Alias for loadMessagesHifi (student compat) */
    async loadMessages(chatId, limit = 60) {
        return this.loadMessagesHifi(chatId, limit);
    }

    /** Mark all messages in a chat as read */
    async markRead(chatId) {
        // No read receipts table — stub for compatibility
        return true;
    }

    /** Subscribe to real-time messages for a chat. Returns channel. */
    subscribeToChat(chatId, onMessage) {
        this._subs = this._subs.filter(ch => {
            if (ch._topic && ch._topic.includes(chatId)) {
                this.sb.removeChannel(ch);
                return false;
            }
            return true;
        });

        const ch = this.sb
            .channel(`chat-messages-${chatId}`)
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'chat_messages',
                    filter: `room_id=eq.${chatId}`
                },
                async (payload) => {
                    const msg = payload.new;
                    const { data: profile } = await this.sb
                        .from('profiles')
                        .select('id, full_name, avatar_url, role')
                        .eq('id', msg.sender_id)
                        .single();

                    onMessage({ ...msg, profiles: profile });
                }
            )
            .subscribe();

        this._subs.push(ch);
        return ch;
    }

    /** Alias for subscribeToChat (student compat) */
    subscribeToRoom(chatId, onMessage) {
        return this.subscribeToChat(chatId, onMessage);
    }

    /** Subscribe to new chats being created (for sidebar refresh) */
    subscribeToNewChats(onNewChat) {
        const ch = this.sb
            .channel('chat-list-changes-' + this.userId)
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'chat_room_members',
                    filter: `user_id=eq.${this.userId}`
                },
                async (payload) => {
                    onNewChat(payload.new);
                }
            )
            .subscribe();

        this._subs.push(ch);
        return ch;
    }

    /** Alias for subscribeToNewChats (student compat) */
    subscribeToRoomChanges(cb) {
        return this.subscribeToNewChats(cb);
    }

    // ── Friend Requests (stubs for student compat) ─────────────

    async getMyFriendRequests() { return []; }
    async sendFriendRequest(targetId) {
        // Stub: just create a direct chat instead
        return this.getOrCreateDirectChatHifi(targetId);
    }
    async respondFriendRequest(id, status) { return true; }
    subscribeToFriendRequests(cb) { return null; }

    // ── Reactions ──────────────────────────────────────────────

    async toggleReaction(messageId, emoji) {
        if (!messageId || !emoji) return;

        // Check if user already reacted with this emoji
        const { data: existing } = await this.sb
            .from('chat_message_reactions')
            .select('id')
            .eq('message_id', contentId)
            .eq('user_id', this.userId)
            .eq('emoji', emoji)
            .single();

        if (existing) {
            // Remove reaction
            await this.sb.from('chat_message_reactions').delete().eq('id', existing.id);
        } else {
            // Add reaction
            await this.sb.from('chat_message_reactions').insert({
                message_id: contentId,
                user_id: this.userId,
                emoji: emoji
            });
        }
    }

    // ── Message stubs ──────────────────────────────────────────

    async togglePin(messageId, pin) { return true; }
    async deleteMessage(messageId) {
        await this.sb.from('chat_messages').delete().eq('id', messageId);
    }

    // ── Presence ───────────────────────────────────────────────

    initPresence(onPresenceChangeOrRoomId, onPresenceChange) {
        // Support both signatures:
        // initPresence(onPresenceChange)  — admin dashboard
        // initPresence(roomId, onPresenceChange)  — student dashboard
        let cb = onPresenceChange;
        if (typeof onPresenceChangeOrRoomId === 'function') {
            cb = onPresenceChangeOrRoomId;
        }

        if (this._presenceChannel) {
            this.sb.removeChannel(this._presenceChannel);
        }

        this._presenceChannel = this.sb.channel('presence-global', {
            config: { presence: { key: this.userId } }
        });

        this._presenceChannel
            .on('presence', { event: 'sync' }, () => {
                const state = this._presenceChannel.presenceState();
                const presenceData = {};
                Object.keys(state).forEach(uid => {
                    const info = state[uid][0];
                    if (info) {
                        presenceData[uid] = {
                            isOnline: true,
                            typingIn: info.typing_in || null,
                            name: info.name
                        };
                    }
                });
                this._onlineUsers = new Set(Object.keys(presenceData));
                if (cb) cb(presenceData);
            })
            .subscribe(async (status) => {
                if (status === 'SUBSCRIBED') {
                    await this._presenceChannel.track({
                        user_id: this.userId,
                        name: this.userName,
                        typing_in: null,
                        online_at: new Date().toISOString()
                    });
                }
            });

        this._subs.push(this._presenceChannel);
        return this._presenceChannel;
    }

    startTyping(roomId) {
        if (!this._presenceChannel) return;
        this._presenceChannel.track({
            user_id: this.userId,
            name: this.userName,
            typing_in: roomId,
            online_at: new Date().toISOString()
        });
        clearTimeout(this._typingTimeouts[roomId]);
        this._typingTimeouts[roomId] = setTimeout(() => this.stopTyping(roomId), 3000);
    }

    stopTyping(roomId) {
        if (!this._presenceChannel) return;
        this._presenceChannel.track({
            user_id: this.userId,
            name: this.userName,
            typing_in: null,
            online_at: new Date().toISOString()
        });
    }

    isUserOnline(userId) {
        return this._onlineUsers.has(userId);
    }

    destroy() {
        this._subs.forEach(ch => {
            try { this.sb.removeChannel(ch); } catch (e) { /* ignore */ }
        });
        this._subs = [];
        this._presenceChannel = null;
    }
}

// ── Render Helpers ────────────────────────────────────────────

/**
 * Renders a content bubble for the high-fidelity chat UI.
 */
export function renderMessageBubbleHifi(msg, currentUserId) {
    const isSelf = msg.sender_id === currentUserId;
    const time = formatTime(msg.created_at);
    const profile = msg.profiles || {};
    const senderName = profile.full_name || 'Unknown';
    const avatarUrl = profile.avatar_url ||
        `https://ui-avatars.com/api/?name=${encodeURIComponent(senderName)}&background=random&color=fff&size=64`;

    let contentHtml = '';
    const fileUrl = msg.file_url;

    if (fileUrl) {
        const isImage = /\.(jpg|jpeg|png|gif|webp|svg)(\?|$)/i.test(fileUrl);
        const isPdf = /\.pdf(\?|$)/i.test(fileUrl);

        if (isImage) {
            contentHtml = `
                <a href="${escHtml(fileUrl)}" target="_blank" rel="noopener">
                    <img src="${escHtml(fileUrl)}" 
                         class="max-w-xs max-h-64 rounded-xl shadow-sm cursor-pointer object-cover hover:opacity-95 transition-opacity"
                         alt="Image"
                         loading="lazy"
                         onerror="this.style.display='none'" />
                </a>`;
        } else {
            const fileName = msg.content || fileUrl.split('/').pop() || 'File';
            contentHtml = `
                <a href="${escHtml(fileUrl)}" target="_blank" rel="noopener"
                   class="flex items-center gap-3 p-3 rounded-xl ${isSelf ? 'bg-white/20' : 'bg-slate-50 border border-slate-100'} hover:opacity-90 transition-opacity cursor-pointer">
                    <span class="material-symbols-outlined text-[28px] ${isSelf ? 'text-white' : 'text-blue-500'}">
                        ${isPdf ? 'picture_as_pdf' : 'description'}
                    </span>
                    <div class="flex-1 min-w-0">
                        <div class="text-xs font-semibold truncate max-w-[180px]">${escHtml(fileName)}</div>
                        <div class="text-[10px] opacity-70 uppercase tracking-wide">Download file</div>
                    </div>
                    <span class="material-symbols-outlined text-sm opacity-70">download</span>
                </a>`;
        }
    } else {
        const text = msg.content || '';
        contentHtml = `<p class="whitespace-pre-wrap break-words leading-relaxed">${escHtml(text)}</p>`;
    }

    return `
    <div class="flex flex-col ${isSelf ? 'items-end' : 'items-start'} mb-3 group">
        <div class="flex items-end gap-2 max-w-[75%] ${isSelf ? 'flex-row-reverse' : ''}">
            ${!isSelf ? `
            <img src="${escHtml(avatarUrl)}" 
                 class="w-7 h-7 rounded-lg flex-shrink-0 mb-1 object-cover"
                 title="${escHtml(senderName)}" 
                 alt="${escHtml(senderName)}"
                 onerror="this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(senderName)}&background=6366f1&color=fff&size=40'" />
            ` : ''}
            <div>
                ${!isSelf ? `<div class="text-[10px] font-bold text-slate-500 mb-1 px-1">${escHtml(senderName)}</div>` : ''}
                <div class="msg-bubble-hifi ${isSelf ? 'outgoing' : 'incoming'}">
                    ${contentHtml}
                </div>
            </div>
        </div>
        <div class="flex items-center gap-1.5 px-1 mt-1 opacity-0 group-hover:opacity-100 transition-opacity ${isSelf ? 'flex-row-reverse' : ''}">
            <span class="text-[10px] font-medium text-slate-400">${time}</span>
            ${isSelf ? `<span class="material-symbols-outlined text-[12px] text-blue-400">done_all</span>` : ''}
        </div>
    </div>`;
}

/** Backward-compat alias */
export function renderMessageBubble(msg, currentUserId, expandable) {
    return renderMessageBubbleHifi(msg, currentUserId);
}

/**
 * Renders a date separator pill
 */
export function renderDateSeparator(isoString) {
    return `
    <div class="flex items-center gap-3 my-4">
        <div class="flex-1 h-px bg-slate-200"></div>
        <span class="text-[10px] font-bold text-slate-400 uppercase tracking-widest bg-slate-100 px-3 py-1 rounded-full">
            ${formatDate(isoString)}
        </span>
        <div class="flex-1 h-px bg-slate-200"></div>
    </div>`;
}

/**
 * Renders a chat list item for the sidebar.
 */
export function renderChatItemHifi(chat, isActive, currentUserId) {
    const name = chat.name || 'Conversation';
    const avatarUrl = chat.avatar_url ||
        `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random&color=fff&size=64`;

    const lastMsg = chat.lastMessage;
    let preview = 'No contents yet';
    if (lastMsg) {
        if (lastMsg.file_url) {
            preview = '📎 Attachment';
        } else {
            preview = (lastMsg.content || '').slice(0, 45) || 'No contents yet';
        }
    }
    const time = lastMsg ? formatTime(lastMsg.created_at) : '';
    const unread = chat.unreadCount || 0;

    return `
    <div class="chat-item ${isActive ? 'active' : ''}" onclick="openHifiChat('${escHtml(chat.id)}')" data-chat-id="${escHtml(chat.id)}">
        <div class="relative flex-shrink-0">
            <img src="${escHtml(avatarUrl)}" 
                 class="avatar" 
                 alt="${escHtml(name)}"
                 onerror="this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=6366f1&color=fff&size=64'" />
            <span class="online-dot"></span>
        </div>
        <div class="chat-item-info">
            <div class="chat-item-header">
                <span class="chat-item-name">${escHtml(name)}</span>
                <span class="chat-item-time">${escHtml(time)}</span>
            </div>
            <p class="chat-item-preview">${escHtml(preview)}</p>
        </div>
        ${unread > 0 ? `
        <span class="flex-shrink-0 w-5 h-5 bg-blue-500 text-white text-[10px] font-bold 
                       flex items-center justify-center rounded-full shadow-lg shadow-blue-500/30">
            ${unread > 9 ? '9+' : unread}
        </span>` : ''}
    </div>`;
}

/** Backward-compat alias */
export function renderChatItem(room, lastMsg, unread, isActive, displayName, initial) {
    const chatObj = {
        ...room,
        name: displayName || room.name,
        lastMessage: lastMsg
    };
    return renderChatItemHifi(chatObj, isActive, null);
}
