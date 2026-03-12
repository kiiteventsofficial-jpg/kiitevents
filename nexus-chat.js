/**
 * nexus-chat.js — KIIT Events Chat Controller v5
 * Tables: chat_rooms, chat_room_members, chat_messages, chat_message_reactions
 * AI: Ollama (deepseek-r1:1.5b) at http://localhost:11434
 * Entry: window.initNexusChat(role)
 */
'use strict';

// ─── HELPERS ──────────────────────────────────────────────────────────────────
function nexusEsc(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function nexusFmtTime(iso) {
    if (!iso) return '';
    return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
}
function nexusFmtDate(iso) {
    if (!iso) return '';
    const d = new Date(iso), today = new Date(), yest = new Date();
    yest.setDate(today.getDate() - 1);
    if (d.toDateString() === today.toDateString()) return 'Today';
    if (d.toDateString() === yest.toDateString()) return 'Yesterday';
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}
function nexusInitials(name) {
    if (!name) return '?';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}
function $id(id) { return document.getElementById(id); }
const $ = $id;

/** Parse content for file attachments: [name](url) → render image, video, or file card
 * Also handles bare Supabase storage URLs that lack clear file extensions.
 */
function nexusRenderContent(text) {
    if (!text) return '';

    // Escape basic HTML first for safety
    let res = nexusEsc(text);

    // 1. Handle @mentions
    res = res.replace(/@(\w+)/g, '<span class="nexus-mention">@$1</span>');

    // 2. Handle Markdown links: [name](url)
    const mdLinkRegex = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g;
    res = res.replace(mdLinkRegex, (_, name, url) => renderMediaFromUrl(url, name));

    // 3. Handle Bare URLs (Images/Videos/Docs)
    const bareUrlRegex = /(?<!\()(?<!")(https?:\/\/[^\s<>)"']+\.(jpg|jpeg|png|gif|webp|mp4|webm|mov|pdf|doc|docx|zip|mp3|wav)(?:[?#][^\s]*)?)/gi;
    res = res.replace(bareUrlRegex, (url) => renderMediaFromUrl(url, url.split('/').pop().split('?')[0]));

    // 4. Handle Bold **text**
    res = res.replace(/\*\*([^\*]+)\*\*/g, '<strong>$1</strong>');

    // 5. Handle Italic *text*
    res = res.replace(/\*([^\*]+)\*/g, '<em>$1</em>');

    return res;
}

function renderMediaFromUrl(url, name) {
    let decodedUrl = url;
    try { decodedUrl = decodeURIComponent(url); } catch (_) { }

    const basePath = decodedUrl.split('?')[0].split('#')[0];
    const ext = (basePath.split('.').pop() || '').toLowerCase().trim();
    const fileName = name || basePath.split('/').pop() || 'File';

    const isImage = /\.(jpg|jpeg|png|gif|webp|svg|bmp|avif|heic|tiff)$/i.test(basePath) || /content-type=image/i.test(url);
    const isVideo = /\.(mp4|webm|mov|avi|mkv|m4v)$/i.test(basePath) || /content-type=video/i.test(url);
    const isAudio = /\.(mp3|wav|m4a|aac|ogg|flac)$/i.test(basePath);

    if (isImage) {
        return `<div class="nexus-img-wrap">
            <img src="${url}" alt="${nexusEsc(fileName)}" class="nexus-inline-img"
                onclick="window.open(this.src,'_blank')"
                onerror="this.parentElement.innerHTML='<a class=nexus-file-card href=&quot;${url}&quot; target=_blank><i class=\'fas fa-image\'></i><span>${nexusEsc(fileName)}</span></a>'">
        </div>`;
    }
    if (isVideo) {
        return `<div class="nexus-video-wrap">
            <video src="${url}" class="nexus-inline-video" controls preload="metadata"></video>
            <div class="nexus-video-label"><i class="fas fa-film"></i> ${nexusEsc(fileName)}</div>
        </div>`;
    }
    if (isAudio) {
        return `<div class="nexus-audio-wrap">
            <audio src="${url}" controls class="nexus-inline-audio"></audio>
            <div class="nexus-audio-label">${nexusEsc(fileName)}</div>
        </div>`;
    }

    const iconMap = {
        pdf: 'fa-file-pdf', doc: 'fa-file-word', docx: 'fa-file-word',
        zip: 'fa-file-archive', rar: 'fa-file-archive', txt: 'fa-file-alt'
    };
    const icon = iconMap[ext] || 'fa-file-alt';
    return `<a class="nexus-file-card" href="${url}" target="_blank" rel="noopener noreferrer">
        <i class="fas ${icon}"></i><span>${nexusEsc(fileName)}</span>
    </a>`;
}



// ─── AI BACKEND (Secure — via Supabase Edge Function) ────────────────────────
// The API key is stored server-side. Frontend never sees it.
const NEXUS_AI_EDGE_URL = 'https://vxsxcgaeyyvzxlkftjcw.supabase.co/functions/v1/groq-chat';

async function nexusAskAI(messages) {
    try {
        // Support both string (legacy) and message array input
        const msgArray = Array.isArray(messages) ? messages : [
            { role: 'system', content: 'You are NEXUS AI, a helpful assistant for the KIIT Events platform. Be concise and friendly.' },
            { role: 'user', content: messages }
        ];

        // Call our secure backend edge function — key never exposed in frontend
        const res = await fetch(NEXUS_AI_EDGE_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ messages: msgArray })
        });

        const data = await res.json();

        if (!res.ok) {
            const errMsg = data?.error || `Server error ${res.status} `;
            console.error('Groq backend error:', errMsg);
            return `⚠️ AI service unavailable: ${errMsg} `;
        }

        return data.reply || '(No response from AI)';
    } catch (e) {
        console.error('nexusAskAI network error:', e.message);
        return '⚠️ AI service unavailable. Please try again.';
    }
}


// ─── WEBRTC CALL MANAGER ──────────────────────────────────────────────────────
class NexusCallManager {
    constructor(sb, userId, userName) {
        this.sb = sb; this.userId = userId; this.userName = userName;
        this.pc = null; this.localStream = null; this.sigCh = null;
        this.currentCallRoomId = null;
    }

    async startCall(roomId, isVideo) {
        this.currentCallRoomId = roomId;
        const overlay = $id('nexusCallOverlay');
        const status = $id('nexusCallOverlayStatus');
        if (overlay) overlay.style.display = 'flex';
        if (status) status.textContent = isVideo ? '📹 Starting video call…' : '📞 Starting voice call…';
        try {
            this.localStream = await navigator.mediaDevices.getUserMedia({ video: isVideo, audio: true });
        } catch (e) {
            alert('Cannot access camera/microphone: ' + e.message);
            if (overlay) overlay.style.display = 'none'; return;
        }
        const lv = $id('nexusLocalVideo'); if (lv) { lv.srcObject = this.localStream; lv.play().catch(() => { }); }

        this.pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }] });
        this.localStream.getTracks().forEach(t => this.pc.addTrack(t, this.localStream));
        this.pc.ontrack = e => { const rv = $id('nexusRemoteVideo'); if (rv) { rv.srcObject = e.streams[0]; rv.play().catch(() => { }); } };

        const sigId = `nexus - sig - ${roomId} `;
        this.sigCh = this.sb.channel(sigId)
            .on('broadcast', { event: 'signal' }, async ({ payload }) => {
                if (payload.from === this.userId) return;
                if (payload.type === 'offer') {
                    await this.pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
                    const answer = await this.pc.createAnswer();
                    await this.pc.setLocalDescription(answer);
                    this.sigCh.send({ type: 'broadcast', event: 'signal', payload: { type: 'answer', from: this.userId, sdp: answer } });
                } else if (payload.type === 'answer') {
                    await this.pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
                } else if (payload.type === 'candidate') {
                    await this.pc.addIceCandidate(new RTCIceCandidate(payload.candidate));
                } else if (payload.type === 'hangup') {
                    this.endCall(false); alert('The other party ended the call.');
                }
            }).subscribe();

        this.pc.onicecandidate = e => {
            if (e.candidate) this.sigCh.send({ type: 'broadcast', event: 'signal', payload: { type: 'candidate', from: this.userId, candidate: e.candidate } });
        };
        const offer = await this.pc.createOffer();
        await this.pc.setLocalDescription(offer);
        this.sigCh.send({ type: 'broadcast', event: 'signal', payload: { type: 'offer', from: this.userId, name: this.userName, sdp: offer, isVideo } });
        if (status) status.textContent = isVideo ? '📹 Video call in progress…' : '📞 Voice call in progress…';

        await this.sb.from('chat_messages').insert({
            room_id: roomId, sender_id: this.userId,
            content: `📞 ${this.userName} started a ${isVideo ? 'video' : 'voice'} call`,
            message_type: 'system'
        });
    }

    endCall(logMessage = true) {
        const roomId = this.currentCallRoomId;
        if (this.pc) { this.pc.close(); this.pc = null; }
        if (this.localStream) { this.localStream.getTracks().forEach(t => t.stop()); this.localStream = null; }
        if (this.sigCh) {
            try { this.sigCh.send({ type: 'broadcast', event: 'signal', payload: { type: 'hangup', from: this.userId } }); } catch (_) { }
            try { this.sb.removeChannel(this.sigCh); } catch (_) { }
            this.sigCh = null;
        }
        const overlay = $id('nexusCallOverlay'); if (overlay) overlay.style.display = 'none';
        const lv = $id('nexusLocalVideo'); if (lv) lv.srcObject = null;
        const rv = $id('nexusRemoteVideo'); if (rv) rv.srcObject = null;
        const muteBtn = $id('nexusMuteBtn'); if (muteBtn) muteBtn.style.opacity = '1';
        const vidBtn = $id('nexusVidOffBtn'); if (vidBtn) vidBtn.style.opacity = '1';
        if (logMessage && roomId) {
            const now = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
            this.sb.from('chat_messages').insert({
                room_id: roomId, sender_id: this.userId,
                content: `📵 ${this.userName} ended the call at ${now} `,
                message_type: 'system'
            }).catch(() => { });
        }
        this.currentCallRoomId = null;
    }
}

// ─── MAIN CHAT CLASS ──────────────────────────────────────────────────────────
class NexusChatUI {
    constructor(sb, userId, userRole, userName) {
        this.sb = sb; this.userId = userId; this.userRole = userRole; this.userName = userName;
        this.rooms = []; this.currentRoomId = null; this.currentRoomIsAI = false;
        this.blockedUsers = []; this.msgSub = null; this.presenceCh = null;
        this.subs = []; this.typingTimeout = null;
        this.isMobile = window.innerWidth <= 900;
        this.callMgr = new NexusCallManager(sb, userId, userName);
        this._selectedGroupMembers = [];
        window.addEventListener('resize', () => { this.isMobile = window.innerWidth <= 900; });
    }

    // ── INIT ─────────────────────────────────────────────────────────────────
    async init() {
        console.log('NexusChatUI: STEP 1 - Starting initialization');
        try {
            // Populate Sidebar Profile
            const initials = nexusInitials(this.userName);
            if ($id('nexusSidebarUserName')) $id('nexusSidebarUserName').innerText = this.userName;
            if ($id('nexusSidebarUserRole')) $id('nexusSidebarUserRole').innerText = this.userRole;
            if ($id('nexusSidebarUserAvatar')) $id('nexusSidebarUserAvatar').innerText = initials;

            // Mobile default view
            if (this.isMobile && !this.currentRoomId) {
                $id('nexusSidebar')?.classList.add('open');
            }

            console.log('NexusChatUI: STEP 2 - Loading blocked users');
            await this._loadBlockedUsers();

            console.log('NexusChatUI: STEP 3 - Ensuring AI room');
            await this._ensureAIRoom();

            console.log('NexusChatUI: STEP 4 - Loading rooms');
            await this._loadRooms();

            console.log('NexusChatUI: STEP 5 - Initializing presence & rooms subscription');
            this._initPresence();
            this._subscribeNewRooms();
            this.bindSearch();

            console.log('✅ NexusChatUI: Initialization complete');
        } catch (e) {
            console.error('❌ NexusChatUI: init error:', e);
        }
    }

    async _loadBlockedUsers() {
        try {
            const { data, error } = await this.sb.from('blocked_users').select('blocked_id').eq('blocker_id', this.userId);
            this.blockedUsers = (data || []).map(r => r.blocked_id);
        } catch (e) {
            this.blockedUsers = [];
        }
    }

    async _ensureAIRoom() {
        // Find existing AI room for this specific user
        const { data: existing } = await this.sb.from('chat_rooms')
            .select('id')
            .eq('type', 'assistant')
            .eq('created_by', this.userId)
            .maybeSingle();

        if (existing) {
            if (!this.rooms.find(r => r.id === existing.id)) {
                this.rooms.unshift({
                    id: existing.id,
                    name: 'NEXUS AI',
                    type: 'assistant',
                    partnerId: 'nexus-ai',
                    lastMsg: 'AI ready',
                    lastAt: new Date().toISOString()
                });
            }
            return;
        }

        // Create new scoped AI room
        const { data: newRoom, error } = await this.sb.from('chat_rooms')
            .insert({ name: 'NEXUS_AI_' + this.userId, type: 'assistant', scope: 'private', created_by: this.userId })
            .select('id').single();

        if (error || !newRoom) return;

        this.rooms.unshift({
            id: newRoom.id,
            name: 'NEXUS AI',
            type: 'assistant',
            partnerId: 'nexus-ai',
            lastMsg: 'Hello! I am Nexus AI.',
            lastAt: new Date().toISOString()
        });
    }

    async _loadRooms() {
        const { data: members, error: loadErr } = await this.sb.from('chat_room_members')
            .select('room_id, role, chat_rooms(id, name, type, created_by)')
            .eq('user_id', this.userId);

        if (loadErr) {
            console.error("Error loading chat rooms:", loadErr);
            return;
        }
        if (!members) return;

        console.log(`NexusChatUI: Loading details for ${members.length} rooms...`);

        const roomPromises = members.map(async (m) => {
            const r = m.chat_rooms;
            if (!r) return null;

            const room = { id: r.id, name: r.name, type: r.type, created_by: r.created_by, memberRole: m.role };

            // Fetch partner info and last message in parallel
            const [partnerRes, lastMsgRes] = await Promise.all([
                r.type === 'direct' ? this.sb.from('chat_room_members')
                    .select('user_id, profiles(id, full_name, email)')
                    .eq('room_id', r.id).neq('user_id', this.userId).maybeSingle() : Promise.resolve({ data: null }),
                this.sb.from('chat_messages')
                    .select('content, file_url, file_name, created_at').eq('room_id', r.id)
                    .order('created_at', { ascending: false }).limit(1).maybeSingle()
            ]);

            if (r.type === 'direct' && partnerRes.data?.profiles) {
                const partner = partnerRes.data;
                room.name = partner.profiles.full_name || partner.profiles.email || 'Unknown';
                room.partnerId = partner.user_id;
            }

            if (lastMsgRes.data) {
                const lastMsg = lastMsgRes.data;
                let txt = lastMsg.content || '';
                if (lastMsg.file_url) txt += `\n[${lastMsg.file_name || 'attachment'}](${lastMsg.file_url})`;
                room.lastMsg = txt;
                room.lastAt = lastMsg.created_at;
            }

            return room;
        });

        const resolvedRooms = await Promise.all(roomPromises);
        this.rooms = resolvedRooms
            .filter(r => r !== null)
            .filter(r => !(r.type === 'direct' && this.blockedUsers.includes(r.partnerId)))
            .sort((a, b) => (b.lastAt || '') > (a.lastAt || '') ? 1 : -1);
        this._renderSidebar();
    }

    _renderSidebar() {
        // HTML uses nexusChannelsList / nexusDMsList / nexusAIList
        const channelList = $id('nexusChannelsList');
        const dmList = $id('nexusDMsList');
        const aiList = $id('nexusAIList');

        // Update counts
        const chCount = this.rooms.filter(r => r.type === 'channel' || r.type === 'group').length;
        const dmCount = this.rooms.filter(r => r.type === 'direct').length;
        const aiCount = this.rooms.filter(r => r.type === 'assistant').length;

        const chHeader = $id('nexusChannelCount');
        const dmHeader = $id('nexusDMCount');
        const aiHeader = $id('nexusAICount');

        if (chHeader) chHeader.textContent = chCount;
        if (dmHeader) dmHeader.textContent = dmCount;
        if (aiHeader) aiHeader.textContent = aiCount;

        if (channelList) channelList.innerHTML = '';
        if (dmList) dmList.innerHTML = '';
        if (aiList) aiList.innerHTML = '';

        for (const room of this.rooms) {
            const el = this._makeSidebarItem(room);
            if (room.type === 'channel' || room.type === 'group') {
                if (channelList) channelList.appendChild(el);
            } else if (room.type === 'direct') {
                if (dmList) dmList.appendChild(el);
            } else if (room.type === 'assistant') {
                if (aiList) aiList.appendChild(el);
            }
        }
    }

    _getPreviewContent(content) {
        if (!content) return '';
        const match = content.match(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/);
        if (match) {
            const name = match[1];
            const url = match[2];
            const cleanUrl = url.split('?')[0];
            const ext = (cleanUrl.split('.').pop() || '').toLowerCase().split('#')[0];
            const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'avif'];
            const videoExts = ['mp4', 'webm', 'mov', 'avi'];

            if (imageExts.includes(ext)) {
                return `<i class="fas fa-image" style="margin-right:5px;opacity:0.8;"></i> ${nexusEsc(name)}`;
            } else if (videoExts.includes(ext)) {
                return `<i class="fas fa-video" style="margin-right:5px;opacity:0.8;"></i> ${nexusEsc(name)}`;
            } else {
                return `<i class="fas fa-file-alt" style="margin-right:5px;opacity:0.8;"></i> ${nexusEsc(name)}`;
            }
        }
        return nexusEsc(content.slice(0, 40));
    }

    _makeSidebarItem(room) {
        const div = document.createElement('div');
        div.className = 'nexus-room-item';
        div.dataset.roomId = room.id;
        if (room.id === this.currentRoomId) div.classList.add('active');

        let iconHtml = '';
        let badgeHtml = '';
        let statusDotClass = 'nexus-status-dot';

        if (room.type === 'assistant') {
            iconHtml = `<div class="nexus-ai-avatar"><i class="fas fa-robot"></i></div>`;
            badgeHtml = `<span class="badge-ai">assistant</span>`;
            statusDotClass += ' nexus-ai-status-dot';
        } else if (room.type === 'direct') {
            iconHtml = `<div class="nexus-dm-avatar">${nexusInitials(room.name)}</div>`;
        } else {
            iconHtml = `<i class="fas fa-hashtag nexus-ch-icon"></i>`;
        }

        const preview = this._getPreviewContent(room.lastMsg) || (room.type === 'assistant' ? 'always here to help' : 'no messages');
        const timeHtml = room.lastAt ? `<div class="nexus-item-time" style="font-size:0.65rem; color:#6b7390;">${nexusFmtTime(room.lastAt)}</div>` : '';

        div.innerHTML = `
            ${iconHtml}
            <div class="nexus-item-body">
                <div class="nexus-item-name" style="display:flex; justify-content:space-between; align-items:center;">
                    <span style="display:flex; align-items:center; gap:6px;">${nexusEsc(room.name)} ${badgeHtml}</span>
                    <div style="display:flex; align-items:center; gap:6px;">
                        ${timeHtml}
                        ${room.type === 'direct' ? `<div class="nexus-dm-opts-btn" title="Options" style="color:#6b7390; padding:2px 6px; cursor:pointer;" onclick="event.stopPropagation();"><i class="fas fa-ellipsis-v"></i></div>` : ''}
                    </div>
                </div>
                <div class="nexus-item-preview">${preview}</div>
            </div>
            <div class="${statusDotClass}"></div>
`;

        div.addEventListener('click', () => this.openRoom(room.id));

        if (room.type === 'direct') {
            const optsBtn = div.querySelector('.nexus-dm-opts-btn');
            if (optsBtn) {
                optsBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this._showDMContextMenu(e, room, optsBtn);
                });
            }

            // Mobile Long Press Logic
            let pressTimer;
            div.addEventListener('touchstart', (e) => {
                pressTimer = setTimeout(() => {
                    this._showDMContextMenu(e, room);
                }, 500);
            }, { passive: true });
            div.addEventListener('touchend', () => clearTimeout(pressTimer));
            div.addEventListener('touchmove', () => clearTimeout(pressTimer));

            div.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                this._showDMContextMenu(e, room);
            });
        }

        return div;
    }

    _showDMContextMenu(e, room, anchor = null) {
        document.querySelectorAll('.nexus-context-menu').forEach(el => el.remove());
        
        // Resolve Coordinates (Desktop Click/Touch vs Anchor Bound)
        let cX = e.clientX;
        let cY = e.clientY;
        
        if (e.type === 'touchstart' && e.touches && e.touches.length > 0) {
            cX = e.touches[0].clientX;
            cY = e.touches[0].clientY;
        } else if (anchor && e.type === 'click') {
            const rect = anchor.getBoundingClientRect();
            cX = rect.right - 180;
            cY = rect.bottom;
            if (cX < 10) cX = 10;
        }

        const menu = document.createElement('div');
        menu.className = 'nexus-context-menu';
        menu.style.cssText = `position:fixed; top:${cY}px; left:${cX}px; background:#1e2433; box-shadow:0 10px 30px rgba(0,0,0,0.8); border-radius:12px; border:1px solid rgba(255,255,255,0.1); z-index:9999; padding:8px; min-width:180px; display:flex; flex-direction:column; gap:4px; font-size:0.85rem; color:#c5cbe3;`;
        
        const btnStyle = "background:transparent; border:none; color:inherit; text-align:left; padding:10px 12px; cursor:pointer; border-radius:8px; transition:0.2s; width:100%; display:flex; align-items:center; gap:10px; font-family:inherit;";

        menu.innerHTML = `
            <button style="${btnStyle}" onmouseover="this.style.background='rgba(255,255,255,0.05)'" onmouseout="this.style.background='transparent'" id="ctxOpenChat"><i class="fas fa-comment"></i> Open Chat</button>
            <button style="${btnStyle}" onmouseover="this.style.background='rgba(255,255,255,0.05)'" onmouseout="this.style.background='transparent'" id="ctxMute"><i class="fas fa-bell-slash"></i> Mute Notifications</button>
            <button style="${btnStyle}" onmouseover="this.style.background='rgba(255,255,255,0.05)'" onmouseout="this.style.background='transparent'" id="ctxViewProfile"><i class="fas fa-user-circle"></i> View Profile</button>
            <hr style="border-top:1px solid rgba(255,255,255,0.05); margin:4px 0; border-bottom:0; width:100%;">
            <button style="${btnStyle}; color:#f39c12;" onmouseover="this.style.background='rgba(243,156,18,0.1)'" onmouseout="this.style.background='transparent'" id="ctxBlock"><i class="fas fa-ban"></i> Block User</button>
            <button style="${btnStyle}; color:#ff5252;" onmouseover="this.style.background='rgba(255,82,82,0.1)'" onmouseout="this.style.background='transparent'" id="ctxDelete"><i class="fas fa-trash-alt"></i> Delete Conversation</button>
        `;

        document.body.appendChild(menu);

        menu.querySelector('#ctxOpenChat').onclick = () => { this.openRoom(room.id); menu.remove(); };
        menu.querySelector('#ctxMute').onclick = () => { alert('Notifications muted for this user.'); menu.remove(); };
        menu.querySelector('#ctxViewProfile').onclick = () => { this.openProfileModal(room.partnerId); menu.remove(); };
        menu.querySelector('#ctxBlock').onclick = async () => { 
            if(confirm('Block this user? You will no longer receive messages from them.')) {
                await this.toggleBlockUser(room.partnerId);
                await this._loadRooms();
                if(this.currentRoomId === room.id) this.leaveChannel(); // Hide layout if currently open
            }
            menu.remove(); 
        };
        menu.querySelector('#ctxDelete').onclick = async () => { 
            if(confirm('Permanently delete this conversation for yourself?')) {
                menu.remove(); 
                if(this.currentRoomId === room.id) {
                    await this.leaveChannel(); // Uses the internal cleanup wrapper safely
                } else {
                    await this.sb.from('chat_room_members').delete().eq('room_id', room.id).eq('user_id', this.userId);
                    await this._loadRooms();
                }
            }
            if (menu.parentNode) menu.remove(); 
        };

        const closeMenu = (evt) => {
            if (!menu.contains(evt.target)) {
                menu.remove();
                document.removeEventListener('click', closeMenu);
            }
        };
        setTimeout(() => document.addEventListener('click', closeMenu), 10);
    }

    async openRoom(roomId) {
        if (!roomId) return;
        this.currentRoomId = roomId;
        const room = this.rooms.find(r => r.id === roomId);
        if (!room) return;

        // UI Updates for Active State
        document.querySelectorAll('.nexus-room-item').forEach(el => {
            el.classList.toggle('active', el.dataset.roomId === roomId);
        });

        // Setup Header
        const header = document.getElementById('nexusChatHeader');
        if (header) header.style.display = 'flex';

        const cbarInfo = document.getElementById('nexusInfoToggleBtn');
        const vcall = document.getElementById('nexusVideoCallBtn');
        const acall = document.getElementById('nexusVoiceCallBtn');
        const addPeopleBtn = document.getElementById('nexusBtnAddPeople');
        const settingsBtn = document.getElementById('nexusChannelSettingsBtn');
        const blockBtn = document.getElementById('nexusBlockBtn');

        if (room.type === 'assistant') {
            this.currentRoomIsAI = true;
            document.getElementById('nexusChatTitle').innerText = 'Nexus AI Assistant';
            document.getElementById('nexusChatMeta').innerHTML = '<span class="status-dot" style="background:#7c4dff;"></span><span class="meta-content">Online • GPT-4 Turbo</span>';
            document.getElementById('nexusHeaderRoomIcon').innerHTML = '<i class="fas fa-robot"></i>';
            document.getElementById('nexusHeaderRoomIcon').style.background = 'rgba(124, 77, 255, 0.2)';
            document.getElementById('nexusHeaderRoomIcon').style.color = '#7c4dff';
            if (cbarInfo) cbarInfo.style.display = 'none';
            if (vcall) vcall.style.display = 'none';
            if (acall) acall.style.display = 'none';
            if (addPeopleBtn) addPeopleBtn.style.display = 'none';
            if (settingsBtn) settingsBtn.style.display = 'none';
            if (blockBtn) blockBtn.style.display = 'none';
        } else if (room.type === 'direct') {
            this.currentRoomIsAI = false;
            const otherUser = room._otherUser || { full_name: 'Unknown User' };
            document.getElementById('nexusChatTitle').innerText = otherUser.full_name;
            document.getElementById('nexusChatMeta').innerHTML = '<span class="status-dot"></span><span class="meta-content">Direct Message</span>';
            document.getElementById('nexusHeaderRoomIcon').innerHTML = '<i class="fas fa-user"></i>';
            document.getElementById('nexusHeaderRoomIcon').style.background = 'rgba(46, 204, 113, 0.2)';
            document.getElementById('nexusHeaderRoomIcon').style.color = '#2ecc71';
            if (cbarInfo) cbarInfo.style.display = 'flex';
            if (vcall) vcall.style.display = 'flex';
            if (acall) acall.style.display = 'flex';
            if (addPeopleBtn) addPeopleBtn.style.display = 'none';
            if (settingsBtn) settingsBtn.style.display = 'none';
            if (blockBtn) blockBtn.style.display = 'block';
        } else { // channel or group
            this.currentRoomIsAI = false;
            document.getElementById('nexusChatTitle').innerText = room.name;
            document.getElementById('nexusChatMeta').innerHTML = `<span class="status-dot" style="background:#ffd700;"></span><span class="meta-content">Channel • ${room.scope || 'all'}</span>`;
            document.getElementById('nexusHeaderRoomIcon').innerHTML = '#';
            document.getElementById('nexusHeaderRoomIcon').style.background = 'rgba(255, 255, 255, 0.1)';
            document.getElementById('nexusHeaderRoomIcon').style.color = '#fff';
            if (cbarInfo) cbarInfo.style.display = 'flex';
            if (vcall) vcall.style.display = 'flex';
            if (acall) acall.style.display = 'flex';
            if (addPeopleBtn) addPeopleBtn.style.display = 'block';
            if (settingsBtn) settingsBtn.style.display = 'block';
            if (blockBtn) blockBtn.style.display = 'none';
        }
        // Display chat layout and hide welcome
        const welcome = $id('nexusWelcome'); if (welcome) welcome.style.display = 'none';
        const main = $id('nexusChatLayout'); if (main) main.style.display = 'flex';
        // Mobile: hide sidebar, show main
        if (this.isMobile) {
            document.body.classList.remove('sidebar-open');
            const sidebar = $id('nexusSidebar');
            if (sidebar) sidebar.classList.remove('open');
            const root = $id('nexusChatRoot');
            if (root) root.classList.add('chat-active');
        }
        // Load messages for all devices
        await this._loadMessages(roomId);
        this._subscribeToMessages(roomId);
    }


    // Modal Methods
    openAddMemberModal() {
        const modal = document.getElementById('nexusAddMemberModal');
        if (modal) {
            modal.classList.add('show');
            const inp = document.getElementById('nexusAddPeopleSearch');
            if (inp) { inp.value = ''; inp.focus(); }
            const res = document.getElementById('nexusAddPeopleResults');
            if (res) res.innerHTML = '';
        }
    }

    async searchAddMembers(query) {
        if (!query || query.length < 1) return [];
        const { data } = await window.supabase.from('profiles')
            .select('id, full_name, email')
            .or(`full_name.ilike.%${query}%,email.ilike.%${query}%`)
            .limit(10);
        return data || [];
    }

    async addMemberToRoom(userId) {
        if (!this.currentRoomId || !userId) return;
        const { error } = await window.supabase.from('chat_room_members').upsert({
            room_id: this.currentRoomId,
            user_id: userId,
            role: 'member'
        }, { onConflict: 'room_id,user_id', ignoreDuplicates: true });

        if (error) {
            alert('Error adding member: ' + error.message);
        } else {
            alert('Member added successfully!');
            if (document.getElementById('nexusChannelSettingsModal')?.classList.contains('show')) {
                await this.openChannelSettingsModal();
            }
        }
    }

    async openChannelSettingsModal() {
        if (!this.currentRoomId) return;
        const modal = document.getElementById('nexusChannelSettingsModal');
        if (!modal) return;
        modal.classList.add('show');

        const title = document.getElementById('nexusChannelSettingsTitle');
        const room = this.rooms.find(r => r.id === this.currentRoomId);
        if (title && room) title.innerHTML = `<i class="fas fa-cog" style="color:#7c4dff;margin-right:8px;"></i>${nexusEsc(room.name)} Settings`;

        const listEl = document.getElementById('nexusSettingsMemberList');
        if (listEl) {
            listEl.innerHTML = '<div style="text-align:center;padding:20px;color:#6b7390;"><i class="fas fa-spinner fa-spin"></i> Loading...</div>';
            // Use currentRoomId directly
            const { data: members } = await window.supabase.from('chat_room_members_view')
                .select('*')
                .eq('room_id', this.currentRoomId);

            if (members) {
                listEl.innerHTML = members.map(m => `
                <div class="nexus-member-item" style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.05);">
                    <div class="nexus-dm-avatar" style="width:24px;height:24px;font-size:0.7rem;">${nexusEsc(nexusInitials(m.full_name || '?'))}</div>
                    <div style="flex:1;min-width:0;font-size:0.8rem;color:#e2e8f0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${nexusEsc(m.full_name || 'User')}</div>
                    <div style="font-size:0.7rem;color:#6b7390;">${nexusEsc(m.role || 'member')}</div>
                </div>
            `).join('');
            } else {
                listEl.innerHTML = '<div style="text-align:center;padding:20px;color:#6b7390;">No members found.</div>';
            }
        }
    }

    /* ======================================================
       SETTINGS V3 CONTROLLER
       ====================================================== */

    async initSettingsV3() {
        if (!this.userId) return;
        const { data, error } = await window.supabase.from('user_settings').select('*').eq('user_id', this.userId).single();
        if (error && error.code === 'PGRST116') {
            // No settings found, create default
            const defaults = {
                user_id: this.userId,
                theme: 'system',
                accent_color: '#7c4dff',
                incoming_bubble_color: 'rgba(255,255,255,0.05)',
                outgoing_bubble_color: '#7c4dff',
                font_size: 'medium'
            };
            await window.supabase.from('user_settings').insert(defaults);
            this.userSettings = defaults;
        } else if (data) {
            this.userSettings = data;
        }
        this.applySettingsV3(this.userSettings);
    }

    applySettingsV3(settings) {
        if (!settings) return;
        const root = document.documentElement;
        
        // 1. Accent & Bubble Colors
        if (settings.accent_color) {
            root.style.setProperty('--nexus-primary', settings.accent_color);
            root.style.setProperty('--nexus-accent', settings.accent_color);
        }
        if (settings.incoming_bubble_color) root.style.setProperty('--nexus-bubble-in', settings.incoming_bubble_color);
        if (settings.outgoing_bubble_color) root.style.setProperty('--nexus-bubble-out', settings.outgoing_bubble_color);

        // 2. Font Size
        const sizes = { small: '12px', medium: '14px', large: '16px', xlarge: '18px' };
        if (settings.font_size) root.style.setProperty('--nexus-font-size', sizes[settings.font_size] || '14px');

        // 3. Theme Mode
        const theme = settings.theme || 'system';
        document.body.classList.remove('light-mode');
        
        if (theme === 'light') {
            document.body.classList.add('light-mode');
        } else if (theme === 'system') {
            const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            if (!prefersDark) document.body.classList.add('light-mode');
        }

        // Update Theme Buttons UI
        document.querySelectorAll('.theme-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.theme === theme);
        });

        // 4. Chat Wallpaper
        const chatLayout = document.getElementById('nexusChatLayout');
        if (chatLayout) {
            if (settings.chat_bg_url) {
                chatLayout.style.backgroundImage = `url(${settings.chat_bg_url})`;
                chatLayout.style.backgroundSize = 'cover';
                chatLayout.style.backgroundPosition = 'center';
                chatLayout.style.backgroundBlendMode = 'overlay';
            } else {
                chatLayout.style.backgroundImage = 'none';
            }
        }

        // 5. UI Toggles
        const msgArea = document.getElementById('nexusMessages');
        if (msgArea) {
            msgArea.classList.toggle('compact-mode', !!settings.compact_mode);
            msgArea.classList.toggle('no-timestamps', settings.show_timestamps === false);
        }
    }

    async openSettingsV3() {
        if (!this.userId) return;
        
        document.body.classList.add('settings-open');
        const modal = document.getElementById('nexusSettingsModalV3');
        if (!modal) return;
        modal.classList.add('show');
        document.body.style.overflow = 'hidden'; // Stop background scroll

        // 1. Profile Data
        const profile = this.userProfile || {};
        const $id = (id) => document.getElementById(id);
        
        if ($id('settingsNameInp')) $id('settingsNameInp').value = profile.full_name || '';
        if ($id('settingsStatusInp')) $id('settingsStatusInp').value = profile.status || '';
        if ($id('settingsEmailView')) $id('settingsEmailView').innerText = profile.email || 'N/A';
        if ($id('settingsRoleView')) $id('settingsRoleView').innerText = profile.role || 'user';
        if ($id('settingsUidView')) $id('settingsUidView').innerText = this.userId;
        
        const av = $id('settingsAvatarV3');
        if (av) {
            av.innerText = profile.avatar_url ? '' : nexusInitials(profile.full_name || '?');
            av.style.backgroundImage = profile.avatar_url ? `url(${profile.avatar_url})` : 'none';
        }

        // 2. Settings Persistence
        const s = this.userSettings || {};
        if ($id('settingsFontSize')) $id('settingsFontSize').value = s.font_size || 'medium';
        if ($id('settingsShowTime')) $id('settingsShowTime').checked = s.show_timestamps !== false;
        if ($id('settingsCompactMode')) $id('settingsCompactMode').checked = !!s.compact_mode;
        if ($id('settingsChatBgInp')) $id('settingsChatBgInp').value = s.chat_bg_url || '';
        if ($id('settingsBubbleInColor')) $id('settingsBubbleInColor').value = s.incoming_bubble_color || '#1e293b';
        if ($id('settingsBubbleOutColor')) $id('settingsBubbleOutColor').value = s.outgoing_bubble_color || '#7c4dff';

        // Set active theme button
        document.querySelectorAll('.theme-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.theme === (s.theme || 'system'));
        });

        // Set active accent
        document.querySelectorAll('#accentPresets .color-swatch-v3').forEach(swatch => {
            swatch.classList.toggle('active', swatch.dataset.color === s.accent_color);
        });

        this.updateBlockedListV3();
    }

    closeSettingsV3() {
        document.body.classList.remove('settings-open');
        const modal = document.getElementById('nexusSettingsModalV3');
        if (modal) modal.classList.remove('show');
        document.body.style.overflow = ''; // Restore scroll
    }

    handleSettingsNav(btn) {
        document.querySelectorAll('.settings-nav-item').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const sectionId = btn.dataset.section;
        document.querySelectorAll('.settings-section').forEach(sec => {
            sec.classList.toggle('show', sec.id === `settings-${sectionId}`);
        });
    }

    async updateAvatarV3(file) {
        if (!file || !this.userId) return;
        
        try {
            const ext = file.name.split('.').pop();
            const path = `avatars/${this.userId}_${Date.now()}.${ext}`;
            
            const { data, error } = await window.supabase.storage.from('avatars').upload(path, file);
            if (error) throw error;
            
            const { data: urlData } = window.supabase.storage.from('avatars').getPublicUrl(path);
            const avatarUrl = urlData.publicUrl;
            
            // Update profile
            await window.supabase.from('profiles').update({ avatar_url: avatarUrl }).eq('id', this.userId);
            this.userProfile.avatar_url = avatarUrl;
            
            // Refresh UI
            const av = document.getElementById('settingsAvatarV3');
            if (av) {
                av.innerText = '';
                av.style.backgroundImage = `url(${avatarUrl})`;
            }
            
            const sbAv = document.getElementById('nexusSidebarUserAvatar');
            if (sbAv) {
                sbAv.innerText = '';
                sbAv.style.backgroundImage = `url(${avatarUrl})`;
            }
            
            alert('Avatar updated!');
        } catch (err) {
            console.error('updateAvatarV3 error:', err);
            alert('Failed to upload avatar.');
        }
    }

    async saveProfileV3() {
        if (!this.userId) return;
        const nameInp = document.getElementById('settingsNameInp');
        const statusInp = document.getElementById('settingsStatusInp');
        
        const profileUpdates = {
            full_name: nameInp?.value || this.userProfile.full_name,
            status: statusInp?.value || this.userProfile.status,
            updated_at: new Date()
        };

        const { error } = await window.supabase.from('profiles').update(profileUpdates).eq('id', this.userId);
        if (error) {
            console.error('saveProfileV3 error:', error);
            alert('Failed to update profile.');
            return;
        }

        this.userProfile = { ...this.userProfile, ...profileUpdates };
        
        // Sync Sidebar & Header
        const sbName = document.getElementById('nexusSidebarUserName');
        if (sbName) sbName.innerText = this.userProfile.full_name;
        const sbAvatar = document.getElementById('nexusSidebarUserAvatar');
        if (sbAvatar) {
            sbAvatar.innerText = this.userProfile.avatar_url ? '' : nexusInitials(this.userProfile.full_name);
            sbAvatar.style.backgroundImage = this.userProfile.avatar_url ? `url(${this.userProfile.avatar_url})` : 'none';
        }
        
        alert('Profile saved successfully!');
    }

    async saveSettingsV3(newPartial) {
        if (!this.userId) return;
        const updated = { ...this.userSettings, ...newPartial };
        this.userSettings = updated;
        this.applySettingsV3(updated);

        // Persistent Settings Save
        await window.supabase.from('user_settings').upsert({
            user_id: this.userId,
            ...updated,
            updated_at: new Date()
        });
    }

    async updateBlockedListV3() {
        const listEl = document.getElementById('settingsBlockedList');
        if (!listEl) return;
        
        // Using view or table joins would be better, but assuming blocked_users table structure
        // blcoker_id, blocked_id
        const { data: blocked, error } = await window.supabase
            .from('blocked_users')
            .select('blocked_id, profiles:blocked_id(full_name, avatar_url)')
            .eq('blocker_id', this.userId);

        if (error) {
            console.error('updateBlockedListV3 error:', error);
            return;
        }

        if (blocked && blocked.length > 0) {
            listEl.innerHTML = blocked.map(b => `
                <div class="blocked-item-v3" style="display:flex; align-items:center; justify-content:space-between; padding:10px; border-bottom:1px solid rgba(255,255,255,0.05);">
                    <div style="display:flex; align-items:center; gap:12px;">
                        <div class="blocked-avatar-v3" style="width:32px; height:32px; border-radius:8px; background:var(--nexus-primary); display:flex; align-items:center; justify-content:center; color:#fff; font-size:12px; font-weight:700;">
                            ${nexusInitials(b.profiles?.full_name || '?')}
                        </div>
                        <span style="color:#fff; font-size:14px;">${nexusEsc(b.profiles?.full_name || 'Unknown')}</span>
                    </div>
                    <button class="nexus-modal-btn danger" style="padding:4px 10px; font-size:11px;" onclick="window.nexusChatCtrl.unblockUserV3('${b.blocked_id}')">Unblock</button>
                </div>
            `).join('');
        } else {
            listEl.innerHTML = '<div class="blocked-empty">No blocked users</div>';
        }
    }

    async unblockUserV3(blockedId) {
        if (!confirm('Are you sure you want to unblock this user?')) return;
        
        const { error } = await window.supabase
            .from('blocked_users')
            .delete()
            .eq('blocker_id', this.userId)
            .eq('blocked_id', blockedId);

        if (error) {
            alert('Failed to unblock user.');
            return;
        }

        this.blockedUsers = this.blockedUsers.filter(id => id !== blockedId);
        this.updateBlockedListV3();
        alert('User unblocked.');
    }

    async leaveChannel() {
        if (!this.currentRoomId) return;

        try {
            const { error } = await window.supabase.from('chat_room_members')
                .delete()
                .eq('room_id', this.currentRoomId)
                .eq('user_id', this.userId);

            if (error) throw error;

            // UI Cleanup
            const cbar = document.getElementById('nexusContextualBar');
            if (cbar) cbar.style.display = 'none';

            this.currentRoomId = null;
            const root = document.getElementById('nexusChatRoot');
            if (root) root.classList.remove('chat-active');

            document.querySelectorAll('.nexus-room-item').forEach(el => el.classList.remove('active'));
            const header = document.getElementById('nexusChatHeader');
            if (header) header.style.display = 'none';

            const msgs = document.getElementById('nexusMessages');
            if (msgs) msgs.innerHTML = '<div style="flex:1;display:flex;align-items:center;justify-content:center;color:#8f9bc0;flex-direction:column;gap:15px;"><i class="fas fa-comment-dots" style="font-size:3rem;opacity:0.5;"></i><p>Select a channel or message</p></div>';

            const inputWrap = document.getElementById('nexusInputWrapper');
            if (inputWrap) inputWrap.style.display = 'none';

            await this._loadRooms();
        } catch (err) {
            console.error('Error leaving channel:', err);
            alert('Failed to leave channel.');
        }
    }


    async _loadMessages(roomId) {
        const msgArea = $id('nexusMessages'); if (!msgArea) return;
        msgArea.innerHTML = '<div style="text-align:center;color:#6b7390;padding:20px;font-size:0.85rem;">Loading…</div>';

        const { data, error } = await this.sb.from('chat_messages')
            .select('id, room_id, sender_id, content, file_url, file_name, message_type, created_at, profiles:sender_id(full_name), chat_message_reactions(emoji, user_id)')
            .eq('room_id', roomId).order('created_at', { ascending: true }).limit(100);

        if (error) { msgArea.innerHTML = `<div style="color:#ff5252;padding:20px;">Error loading messages: ${nexusEsc(error.message)}</div>`; return; }

        msgArea.innerHTML = '';
        if (!data || data.length === 0) {
            msgArea.innerHTML = '<div class="nexus-empty-msgs">No messages yet. Say hi! 👋</div>';
            return;
        }

        let lastDate = '';
        let prevMsg = null;
        for (const msg of data) {
            const msgDate = nexusFmtDate(msg.created_at);
            if (msgDate !== lastDate) {
                const sep = document.createElement('div');
                sep.className = 'nexus-date-sep'; sep.innerHTML = `<span> ${nexusEsc(msgDate)}</span> `;
                msgArea.appendChild(sep);
                lastDate = msgDate;
                prevMsg = null; // Don't group across dates
            }
            const el = this._buildMsgEl(msg, prevMsg);
            msgArea.appendChild(el);
            prevMsg = msg;
        }
        msgArea.scrollTop = msgArea.scrollHeight;
    }

    _buildMsgEl(msg, prevMsg = null) {
        const isAI = msg.message_type === 'assistant';
        const isOwn = (msg.sender_id === this.userId) && !isAI;
        const isSystem = msg.message_type === 'system';

        if (isSystem) {
            const div = document.createElement('div');
            div.className = 'nexus-date-sep';
            div.innerHTML = `<span> ${nexusEsc(msg.content)}</span> `;
            return div;
        }

        const senderName = msg.profiles?.full_name || 'Unknown';
        const initials = nexusInitials(senderName);
        const time = nexusFmtTime(msg.created_at);

        // Grouping logic: same sender AND within 5 mins
        let isGrouped = false;
        if (prevMsg && prevMsg.sender_id === msg.sender_id && prevMsg.message_type !== 'system') {
            const curTime = new Date(msg.created_at).getTime();
            const prevTime = new Date(prevMsg.created_at).getTime();
            if (Math.abs(curTime - prevTime) < 5 * 60000) {
                isGrouped = true;
            }
        }

        const div = document.createElement('div');
        div.className = `nexus-msg-row${isGrouped ? ' nexus-grouped' : ''}${isOwn ? ' own' : ''}${msg.is_pinned ? ' pinned' : ''}`;
        div.dataset.msgId = msg.id;
        div.dataset.time = time;

        let fullContent = '';
        if (msg.file_url) {
            // Always render the file directly using the dedicated renderer
            fullContent = renderMediaFromUrl(msg.file_url, msg.file_name || 'Attachment');
            // If there's also plain text content (not just a markdown link), show it above
            if (msg.content && !msg.content.startsWith('[') && msg.content !== msg.file_name) {
                fullContent = nexusEsc(msg.content) + '<br>' + fullContent;
            }
        } else {
            fullContent = nexusRenderContent(msg.content || '');
        }


        div.innerHTML = `
    <div class="nexus-msg-avatar-col">
        <div class="nexus-msg-avatar ${isAI ? 'ai' : ''}" title="${nexusEsc(senderName)}">
            ${isAI ? '<i class="fas fa-robot"></i>' : nexusEsc(initials)}
        </div>
            </div>
            <div class="nexus-msg-content-col">
                ${!isGrouped ? `
                    <div class="nexus-msg-header">
                        <span class="nexus-msg-sender">${nexusEsc(senderName)}</span>
                        <span class="nexus-msg-time">${time}</span>
                        ${isAI ? '<span class="nexus-msg-ai-badge">AI</span>' : ''}
                    </div>
                ` : ''}
                <div class="nexus-msg-text">${nexusRenderContent(fullContent)}</div>
                <div class="nexus-msg-reactions-area"></div>
            </div>
            <div class="nexus-msg-actions" style="display:flex; gap:4px; opacity:0; transition:0.2s; position:absolute; right:20px; top:-10px; background:rgba(22,28,45,0.9); padding:4px; border-radius:8px; border:1px solid rgba(255,255,255,0.1); z-index:10; box-shadow:0 4px 10px rgba(0,0,0,0.5);">
                <button class="nexus-msg-action-btn rx" title="React"><i class="far fa-smile"></i></button>
                <button class="nexus-msg-action-btn reply" title="Reply"><i class="fas fa-reply"></i></button>
                <button class="nexus-msg-action-btn copy" title="Copy"><i class="far fa-copy"></i></button>
                ${isOwn ? `<button class="nexus-msg-action-btn del" title="Delete"><i class="far fa-trash-alt" style="color:#ff5252;"></i></button>` : ''}
            </div>`;

        // Reactions
        const rxArea = div.querySelector('.nexus-msg-reactions-area');
        if (rxArea) rxArea.innerHTML = this._buildReactions(msg.chat_message_reactions || [], msg.id);

        // Events
        div.querySelector('.rx')?.addEventListener('click', (e) => this._showReactionPicker(msg.id, e.currentTarget));
        div.querySelector('.del')?.addEventListener('click', async () => {
            if (!confirm('Delete this message for everyone?')) return;
            const { error } = await this.sb.from('chat_messages').delete().eq('id', msg.id).eq('sender_id', this.userId);
            if (error) {
                console.error('Delete error:', error);
                alert('Could not delete: ' + error.message);
            } else {
                div.remove();
            }
        });
        
        div.querySelector('.copy')?.addEventListener('click', async () => {
            try {
                await navigator.clipboard.writeText(msg.content || '');
                const t = document.createElement('div');
                t.style.cssText = 'position:fixed;bottom:80px;right:24px;background:#7c4dff;color:#fff;padding:10px 18px;border-radius:10px;font-size:0.85rem;z-index:9999;box-shadow:0 4px 20px rgba(124,77,255,0.4);animation:fadeIn 0.2s ease';
                t.innerHTML = '<i class="far fa-copy" style="margin-right:6px;"></i> Message copied!';
                document.body.appendChild(t);
                setTimeout(() => t.remove(), 2500);
            } catch (err) { }
        });

        div.querySelector('.reply')?.addEventListener('click', () => {
             const preview = document.getElementById('nexusReplyPreview');
             if(preview) {
                 const name = evt => nexusEsc(msg.profiles?.full_name || 'User');
                 const text = nexusEsc((msg.content || '').substring(0, 60)) + ((msg.content || '').length > 60 ? '...' : '');
                 preview.innerHTML = `
                 <div style="flex:1; border-left:3px solid #7c4dff; padding-left:10px; margin-left:10px;">
                    <div style="font-size:0.75rem; color:#7c4dff; font-weight:700;">Replying to ${name()}</div>
                    <div style="font-size:0.85rem; color:#8f9bc0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${text}</div>
                 </div>
                 <i class="fas fa-times" style="cursor:pointer; padding:10px; color:#8f9bc0;" onclick="document.getElementById('nexusReplyPreview').style.display='none'; window.nexusReplyMsgId=null;"></i>
                 `;
                 preview.style.display = 'flex';
                 window.nexusReplyMsgId = msg.id;
                 window.nexusReplyText = text;
                 window.nexusReplyAuthor = name();
                 document.getElementById('nexusMsgInput')?.focus();
             }
        });

        if (!isAI) {
            div.querySelector('.nexus-msg-avatar')?.addEventListener('click', () => this.openProfileModal(msg.sender_id));
            div.querySelector('.nexus-msg-sender')?.addEventListener('click', () => this.openProfileModal(msg.sender_id));
        }

        return div;
    }

    _buildReactions(reactions, msgId) {
        if (!reactions || reactions.length === 0) return '';
        const groups = {};
        for (const r of reactions) {
            if (!groups[r.emoji]) groups[r.emoji] = { count: 0, mine: false };
            groups[r.emoji].count++;
            if (r.user_id === this.userId) groups[r.emoji].mine = true;
        }
        const pills = Object.entries(groups).map(([emoji, { count, mine }]) =>
            `<button class="nexus-reaction-pill${mine ? ' mine' : ''}" data-mid="${msgId}" data-emoji="${emoji}">${emoji} ${count}</button>`
        ).join('');
        return `<div class="nexus-reactions">${pills}</div>`;
    }

    _showReactionPicker(msgId, anchor) {
        document.querySelectorAll('.nexus-rx-picker').forEach(p => p.remove());
        const emojis = ['👍', '❤️', '😂', '😮', '😢', '🔥', '🎉', '👏', '😡', '🤔'];
        const picker = document.createElement('div'); // Create picker dynamically
        picker.className = 'nexus-rx-picker';
        picker.innerHTML = emojis.map(e => `<span data-emoji="${e}">${e}</span>`).join('');
        picker.querySelectorAll('span').forEach(s => s.addEventListener('click', () => {
            this._toggleReaction(msgId, s.dataset.emoji);
            picker.remove();
        }));
        anchor.parentNode.appendChild(picker);
        setTimeout(() => document.addEventListener('click', () => picker.remove(), { once: true }), 10);
    }

    async _toggleReaction(msgId, emoji) {
        const { data: existing } = await this.sb.from('chat_message_reactions')
            .select('id').eq('message_id', msgId).eq('user_id', this.userId).eq('emoji', emoji).maybeSingle();
        if (existing) {
            await this.sb.from('chat_message_reactions').delete().eq('id', existing.id);
        } else {
            await this.sb.from('chat_message_reactions').insert({ message_id: msgId, user_id: this.userId, emoji });
        }
    }

    async _generateAIResponse(roomId, prompt) {
        console.log('STEP 1: _generateAIResponse started', prompt);

        const targetRoomId = roomId || this.currentRoomId;
        const msgArea = $id('nexusMessages');

        // Show typing indicator while waiting for AI
        const thinkingId = 'nexus-ai-thinking-' + Date.now();
        const thinking = document.createElement('div');
        thinking.className = 'nexus-msg-row'; thinking.id = thinkingId;
        thinking.innerHTML = `
            <div class="nexus-msg-avatar-col">
                <div class="nexus-msg-avatar ai"><i class="fas fa-robot"></i></div>
            </div>
            <div class="nexus-msg-content-col">
                <div class="nexus-msg-header">
                    <span class="nexus-msg-sender">Nexus AI</span>
                    <span class="nexus-msg-time">now</span>
                    <span class="nexus-msg-ai-badge">AI</span>
                </div>
                <div class="nexus-msg-text">
                    <span class="nexus-typing-indicator"><span>.</span><span>.</span><span>.</span></span>
                </div>
            </div>`;
        if (msgArea) { msgArea.appendChild(thinking); msgArea.scrollTop = msgArea.scrollHeight; }

        // Fetch last 12 messages for context
        const { data: history } = await this.sb.from('chat_messages')
            .select('content, message_type')
            .eq('room_id', targetRoomId)
            .order('created_at', { ascending: false })
            .limit(12);

        const messages = [
            { role: 'system', content: 'You are NEXUS AI, a helpful assistant for the KIIT Events platform. Be concise and friendly.' }
        ];

        if (history) {
            // Reverse so they are in chronological order
            history.reverse().forEach(m => {
                messages.push({
                    role: m.message_type === 'assistant' ? 'assistant' : 'user',
                    content: m.content
                });
            });
        }

        // Add current prompt if not already the last message in history (usually it is, since we just inserted it)
        if (!history || history.length === 0 || history[0].content !== prompt) {
            messages.push({ role: 'user', content: prompt });
        }

        console.log('STEP 2: Sending request to Groq edge function with history');

        const aiReply = await nexusAskAI(messages);

        console.log('STEP 3: Groq reply received', aiReply);

        // Remove typing indicator
        document.getElementById(thinkingId)?.remove();

        // Insert AI reply into database
        const { error: insertErr } = await this.sb.from('chat_messages').insert({
            room_id: targetRoomId,
            sender_id: this.userId,
            content: aiReply,
            message_type: 'assistant'
        });

        if (insertErr) {
            console.error('STEP 4 FAILED — AI insert error:', insertErr.message);
        } else {
            console.log('STEP 4: AI reply inserted into database');
        }
    }


    _subscribeToMessages(roomId) {
        if (this.msgSub) {
            try { this.sb.removeChannel(this.msgSub); } catch (_) { }
        }

        const channelName = `nexus-room-${roomId}`;
        this.msgSub = this.sb.channel(channelName);

        this.msgSub
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `room_id = eq.${roomId}` }, async (payload) => {
                const msg = payload.new;
                const { data: full } = await this.sb.from('chat_messages')
                    .select('*, profiles(full_name, avatar_url), chat_message_reactions(emoji, user_id)')
                    .eq('id', msg.id).single();

                if (!full) return;

                const msgArea = $id('nexusMessages');
                if (msgArea) {
                    const empty = msgArea.querySelector('.nexus-empty-msgs');
                    if (empty) empty.remove();

                    // Grouping check for real-time
                    const lastRow = msgArea.querySelector('.nexus-msg-row:last-of-type');
                    let prevMsgLocal = null;
                    if (lastRow) {
                        const lastAvatar = lastRow.querySelector('.nexus-msg-avatar');
                        const lastAvatarTitle = lastAvatar ? lastAvatar.getAttribute('title') : null;
                        const sameSender = full.profiles && lastAvatarTitle === full.profiles.full_name;

                        prevMsgLocal = {
                            sender_id: sameSender ? full.sender_id : null,
                            created_at: lastRow.dataset.time ? new Date() : new Date(0),
                            message_type: 'text'
                        };
                    }

                    msgArea.appendChild(this._buildMsgEl(full, prevMsgLocal));
                    msgArea.scrollTop = msgArea.scrollHeight;
                }

                // Update sidebar preview
                const room = this.rooms.find(r => r.id === roomId);
                if (room) {
                    room.lastMsg = msg.content;
                    room.lastAt = msg.created_at;
                    this._renderSidebar();
                }
            })
            .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'chat_messages', filter: `room_id = eq.${roomId}` }, (payload) => {
                const el = document.querySelector(`[data-msg-id="${payload.old.id}"]`);
                if (el) el.remove();
            })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_message_reactions' }, async () => {
                // Refresh reactions for current messages
                const { data } = await this.sb.from('chat_messages')
                    .select('id, chat_message_reactions(emoji, user_id)')
                    .eq('room_id', roomId);

                if (!data) return;

                for (const msg of data) {
                    const rxContainer = document.querySelector(`[data-msg-id="${msg.id}"] .nexus-reactions`);
                    if (rxContainer) {
                        rxContainer.outerHTML = this._buildReactions(msg.chat_message_reactions, msg.id);
                    } else {
                        const msgEl = document.querySelector(`[data-msg-id="${msg.id}"] .nexus-msg-body`);
                        if (msgEl && msg.chat_message_reactions?.length) {
                            const temp = document.createElement('div');
                            temp.innerHTML = this._buildReactions(msg.chat_message_reactions, msg.id);
                            msgEl.appendChild(temp.firstChild);
                        }
                    }
                }
            })
            .subscribe();
    }

    _subscribeNewRooms() {
        const sub = this.sb.channel('nexus-new-rooms')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_room_members', filter: `user_id = eq.${this.userId}` }, async () => {
                await this._loadRooms();
            }).subscribe();
        this.subs.push(sub);
    }

    _initPresence() {
        if (this.presenceCh) { try { this.sb.removeChannel(this.presenceCh); } catch (_) { } }
        this.presenceCh = this.sb.channel('nexus-presence')
            .on('presence', { event: 'sync' }, () => {
                const state = this.presenceCh.presenceState();
                // Update online indicators
                document.querySelectorAll('.nexus-room-item .nexus-dm-avatar').forEach(av => {
                    const roomId = av.closest('.nexus-room-item')?.dataset.roomId;
                    const room = this.rooms.find(r => r.id === roomId);
                    if (room?.partnerId) {
                        const online = Object.values(state).some(arr => arr.some(u => u.userId === room.partnerId));
                        const dot = av.nextElementSibling;
                        if (dot && dot.classList.contains('nexus-status-dot')) {
                            dot.style.background = online ? '#2ecc71' : '#6b7390';
                        }
                    }
                });
            }).subscribe(async (status) => {
                if (status === 'SUBSCRIBED') {
                    await this.presenceCh.track({ userId: this.userId, online: true });
                }
            });
    }

    // ── DM ───────────────────────────────────────────────────────────────────
    async startDM(partnerId, partnerName) {
        if (this.blockedUsers.includes(partnerId)) {
            if (confirm('You have blocked this user. Do you want to unblock them to start a direct message?')) {
                await this.toggleBlockUser(partnerId);
            } else {
                const dmModal = document.getElementById('nexusDMModal');
                if (dmModal) dmModal.classList.remove('show');
                return;
            }
        }

        // Check if DM room already exists locally or in DB
        const existing = this.rooms.find(r => r.type === 'direct' && r.partnerId === partnerId);
        if (existing) { 
            alert('This person already exists in your Direct Messages.');
            this.openRoom(existing.id); 
            const sbElem = document.getElementById('nexusSidebar');
            if (sbElem) sbElem.classList.remove('open');
            return; 
        }

        const roomQuery = await this.sb.rpc('get_dm_room', { user1: this.userId, user2: partnerId });
        
        if (roomQuery.data) {
             alert('This person already exists in your Direct Messages.');
             if (!this.rooms.find(r => r.id === roomQuery.data)) {
                 await this._loadRooms(); // Guarantee room exists in local mapping before opening
             }
             this.openRoom(roomQuery.data); 
             const sbElem = document.getElementById('nexusSidebar');
             if (sbElem) sbElem.classList.remove('open');
             return; 
        }

        const { data: room, error } = await this.sb.from('chat_rooms').insert({
            name: `dm_${this.userId}_${partnerId}`,
            type: 'direct',
            scope: 'direct',
            created_by: this.userId
        }).select().single();
        if (error || !room) { console.error('DM create error:', error); return; }

        await this.sb.from('chat_room_members').insert([
            { room_id: room.id, user_id: this.userId, role: 'member' },
            { room_id: room.id, user_id: partnerId, role: 'member' }
        ]);
        await this._loadRooms();
        this.openRoom(room.id);
        const sbElem = document.getElementById('nexusSidebar');
        if (sbElem) sbElem.classList.remove('open');
    }

    // ── MESSAGING ────────────────────────────────────────────────────────────
    async sendMessage() {
        if (!this.currentRoomId) return;

        // Check block restriction defensively
        const activeRoom = this.rooms.find(r => r.id === this.currentRoomId);
        if (activeRoom && activeRoom.type === 'direct' && this.blockedUsers.includes(activeRoom.partnerId)) {
            alert('You have blocked this user. Unblock them to send a message.');
            return;
        }

        const msgInp = document.getElementById('nexusMsgInput');
        if (!msgInp) return;
        const content = msgInp.value.trim();
        if (!content) return;

        msgInp.value = '';

        // OPTIMISTIC UI RENDER
        const msgArea = document.getElementById('nexusMessages');
        if (msgArea) {
            const empty = msgArea.querySelector('.nexus-empty-msgs');
            if (empty) empty.remove();
            
            const tempId = 'temp_' + Date.now();
            const tempMsgData = {
                id: tempId,
                room_id: this.currentRoomId,
                sender_id: this.userId,
                content: content,
                message_type: 'text',
                created_at: new Date().toISOString(),
                profiles: { full_name: this.userName }
            };
            
            // Check grouping
            const lastRow = msgArea.querySelector('.nexus-msg-row:last-of-type');
            let prevMsgLocal = null;
            if (lastRow) {
                const lastAvatar = lastRow.querySelector('.nexus-msg-avatar');
                const lastAvatarTitle = lastAvatar ? lastAvatar.getAttribute('title') : null;
                const sameSender = lastAvatarTitle === this.userName;

                prevMsgLocal = {
                    sender_id: sameSender ? this.userId : null,
                    created_at: lastRow.dataset.time ? new Date() : new Date(0),
                    message_type: 'text'
                };
            }

            const tempEl = this._buildMsgEl(tempMsgData, prevMsgLocal);
            tempEl.style.opacity = '0.7'; // Indicate pending state
            tempEl.setAttribute('data-temp-msg', 'true');
            msgArea.appendChild(tempEl);
            msgArea.scrollTop = msgArea.scrollHeight;
        }

        // Insert user message
        const finalContent = window.nexusReplyMsgId ? 
            `<blockquote data-reply="${window.nexusReplyMsgId}"><strong>${window.nexusReplyAuthor}:</strong> ${window.nexusReplyText}</blockquote>` + content : 
            content;

        const { data: insertedMsg, error } = await this.sb.from('chat_messages').insert({
            room_id: this.currentRoomId,
            sender_id: this.userId,
            content: finalContent,
            message_type: 'text'
        }).select().single();

        if (error) {
            console.error('Send error:', error);
            msgInp.value = content;
             // Remove optimistic UI if failed
             const failedEl = msgArea?.querySelector('[data-temp-msg="true"]');
             if(failedEl) failedEl.remove();
            return;
        }

        // Cleanup reply state
        if (window.nexusReplyMsgId) {
            const preview = document.getElementById('nexusReplyPreview');
            if (preview) preview.style.display = 'none';
            window.nexusReplyMsgId = null;
            window.nexusReplyText = null;
            window.nexusReplyAuthor = null;
        }

        // Check the room type directly from DB — reliable, no flag dependency
        const { data: room } = await this.sb
            .from('chat_rooms')
            .select('type')
            .eq('id', this.currentRoomId)
            .single();

        if (room && room.type === 'assistant') {
            console.log('AI assistant triggered');
            this._generateAIResponse(this.currentRoomId, content);
        }
    }



    // ── BROADCAST ────────────────────────────────────────────────────────────
    async broadcast(target, message) {
        let roomIds = [];
        if (target === 'all') {
            roomIds = this.rooms.filter(r => r.type === 'channel').map(r => r.id);
        } else {
            const targetRoom = this.rooms.find(r => r.name === target || r.id === target);
            if (targetRoom) roomIds = [targetRoom.id];
        }
        for (const rid of roomIds) {
            await this.sb.from('chat_messages').insert({
                room_id: rid, sender_id: this.userId,
                content: message, message_type: 'broadcast'
            });
        }
    }

    // ── TYPING ───────────────────────────────────────────────────────────────
    _sendTyping() {
        if (!this.presenceCh || !this.currentRoomId) return;
        this.presenceCh.track({ userId: this.userId, typing: this.currentRoomId });
        clearTimeout(this.typingTimeout);
        this.typingTimeout = setTimeout(() => { this.presenceCh.track({ userId: this.userId, typing: null }); }, 2000);
    }

    // ── MENTIONS ─────────────────────────────────────────────────────────────
    async _handleMentionInput(val, inp) {
        const atIdx = val.lastIndexOf('@');
        if (atIdx < 0) { this._hideMentionList(); return; }
        const query = val.slice(atIdx + 1);
        if (query.length < 1) { this._hideMentionList(); return; }

        const { data } = await this.sb.from('profiles').select('id,full_name,email')
            .ilike('full_name', `%${query}%`).limit(8);
        if (!data || data.length === 0) { this._hideMentionList(); return; }

        let list = $id('nexusMentionList');
        if (!list) {
            list = document.createElement('div');
            list.className = 'nexus-mention-list'; list.id = 'nexusMentionList';
            inp.parentNode.style.position = 'relative';
            inp.parentNode.appendChild(list);
        }
        list.innerHTML = data.map(u => `
            <div class="nexus-mention-item" data-name="${nexusEsc(u.full_name || u.email)}">
                <strong>${nexusEsc(u.full_name || '?')}</strong>
                <small style="color:#6b7390;display:block">${nexusEsc(u.email || '')}</small>
            </div>
        `).join('');
        list.style.display = '';
        list.querySelectorAll('.nexus-mention-item').forEach(item => {
            item.addEventListener('click', () => {
                inp.value = val.slice(0, atIdx) + '@' + item.dataset.name + ' ';
                this._hideMentionList(); inp.focus();
            });
        });
    }

    _hideMentionList() {
        const list = $id('nexusMentionList'); if (list) list.style.display = 'none';
    }

    // ── CHANNEL SETTINGS ─────────────────────────────────────────────────────


    // ── SEARCH MESSAGES ──────────────────────────────────────────────────────
    bindSearch() {
        const searchInp = document.getElementById('nexusMsgSearch');
        if (!searchInp) return;
        searchInp.addEventListener('input', (e) => {
            const q = e.target.value.toLowerCase();
            const msgArea = document.getElementById('nexusMessages');
            if (!msgArea) return;
            const msgs = msgArea.querySelectorAll('.nexus-msg-row');
            msgs.forEach(row => {
                const textNodes = row.querySelectorAll('.nexus-msg-text');
                let found = false;
                textNodes.forEach(t => {
                    if (t.textContent.toLowerCase().includes(q)) found = true;
                });
                row.style.display = (q === '' || found) ? 'flex' : 'none';
            });
        });
    }

    // ── MODALS & MEMBERS ─────────────────────────────────────────────────────
    openAddMemberModal() {
        if (!this.currentRoomId) return;
        const modal = document.getElementById('nexusAddMemberModal');
        if (modal) {
            modal.classList.add('show');
            const inp = document.getElementById('nexusAddPeopleSearch');
            if (inp) inp.value = '';
            const res = document.getElementById('nexusAddPeopleResults');
            if (res) res.innerHTML = '';
        }
    }

    async searchAddMembers(q) {
        if (!q || !q.trim()) return [];
        const { data, error } = await this.sb.from('profiles').select('id, full_name, email')
            .or(`full_name.ilike.%${q}%,email.ilike.%${q}%`)
            .neq('id', this.userId)
            .limit(10);
        if (error) { console.error('Search error:', error); return []; }
        return data || [];
    }

    async addMemberToRoom(uid) {
        if (!this.currentRoomId || !uid) return;
        const { error } = await this.sb.from('chat_room_members').insert({
            room_id: this.currentRoomId,
            user_id: uid,
            role: 'member'
        });
        if (error && error.code !== '23505') {
            alert('Error adding member: ' + error.message);
        } else {
            alert('Member added successfully.');
            // Refetch or update UI
            this._refreshSettingsMemberList(this.currentRoomId);
            const modal = document.getElementById('nexusAddMemberModal');
            if (modal) modal.classList.remove('show');
        }
    }

    openChannelSettings(roomId) {
        this.openChannelSettingsModal();
    }

    openChannelSettingsModal() {
        if (!this.currentRoomId) return;
        const modal = document.getElementById('nexusChannelSettingsModal');
        if (modal) {
            modal.classList.add('show');
            this._refreshSettingsMemberList(this.currentRoomId);
        }
    }

    async leaveChannel() {
        if (!this.currentRoomId) return;
        if (!confirm('Are you sure you want to leave this channel?')) return;
        const { error } = await this.sb.from('chat_room_members')
            .delete()
            .eq('room_id', this.currentRoomId)
            .eq('user_id', this.userId);

        if (error) {
            alert('Error leaving channel: ' + error.message);
            return;
        }

        const modal = document.getElementById('nexusChannelSettingsModal');
        if (modal) modal.classList.remove('show');

        this.currentRoomId = null;
        const msgArea = document.getElementById('nexusMessages');
        if (msgArea) msgArea.innerHTML = '';
        const title = document.getElementById('nexusChatTitle');
        if (title) title.textContent = 'Select a chat';

        await this._loadRooms();
    }

    async _refreshSettingsMemberList(roomId) {
        const list = $id('nexusSettingsMemberList'); if (!list) return;
        list.innerHTML = '<div style="color:#6b7390;padding:8px;font-size:0.8rem;">Loading…</div>';
        const { data } = await this.sb.from('chat_room_members')
            .select('user_id, role, profiles(full_name, email)').eq('room_id', roomId);
        if (!data) { list.innerHTML = ''; return; }
        list.innerHTML = data.map(m => {
            const name = nexusEsc(m.profiles?.full_name || m.profiles?.email || 'User');
            const email = nexusEsc(m.profiles?.email || '');
            return `<div class="nexus-member-item" style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.05);">
                <div class="nexus-dm-avatar">${nexusEsc(nexusInitials(m.profiles?.full_name || '?'))}</div>
                <div style="flex:1;min-width:0;">
                    <div style="font-size:0.85rem;font-weight:600;">${name}</div>
                    <div style="font-size:0.72rem;color:#6b7390;">${email}</div>
                </div>
                <span class="nexus-badge-role" data-uid="${m.user_id}" data-room="${roomId}" title="Toggle admin">${m.role === 'admin' ? '👑' : '👤'}</span>
                <button class="nexus-modal-btn danger" style="padding:3px 10px;font-size:0.72rem;" data-uid="${m.user_id}" data-room="${roomId}">Remove</button>
            </div>`;
        }).join('');

        list.querySelectorAll('.nexus-badge-role').forEach(btn => {
            btn.addEventListener('click', async () => {
                const { data: cur } = await this.sb.from('chat_room_members').select('role').eq('room_id', btn.dataset.room).eq('user_id', btn.dataset.uid).single();
                const newRole = cur?.role === 'admin' ? 'member' : 'admin';
                await this.sb.from('chat_room_members').update({ role: newRole }).eq('room_id', btn.dataset.room).eq('user_id', btn.dataset.uid);
                btn.textContent = newRole === 'admin' ? '👑' : '👤';
            });
        });
        list.querySelectorAll('.nexus-modal-btn.danger').forEach(btn => {
            btn.addEventListener('click', async () => {
                if (!confirm('Remove this member?')) return;
                await this.sb.from('chat_room_members').delete().eq('room_id', btn.dataset.room).eq('user_id', btn.dataset.uid);
                await this._refreshSettingsMemberList(roomId);
            });
        });
    }

    async _bulkAddToChannel(roomId, filter) {
        let query = this.sb.from('profiles').select('id, role');
        if (filter === 'admins') query = query.eq('role', 'admin');
        else if (filter === 'students') query = query.eq('role', 'student');
        const { data: users } = await query;
        if (!users) return;
        const inserts = users.map(u => ({ room_id: roomId, user_id: u.id, role: 'member' }));
        // upsert to avoid duplicate key errors
        await this.sb.from('chat_room_members').upsert(inserts, { onConflict: 'room_id,user_id', ignoreDuplicates: true });
        await this._refreshSettingsMemberList(roomId);
        alert(`Added ${users.length} user(s) to channel.`);
    }

    async deleteChannel(roomId = this.currentRoomId) {
        if (!roomId) return;
        if (!confirm('Delete this channel? This is permanent.')) return;
        await this.sb.from('chat_messages').delete().eq('room_id', roomId);
        await this.sb.from('chat_room_members').delete().eq('room_id', roomId);
        await this.sb.from('chat_rooms').delete().eq('id', roomId);
        $id('nexusChannelSettingsModal')?.classList.remove('show');
        this.currentRoomId = null;
        const msgArea = $id('nexusMessages'); if (msgArea) msgArea.innerHTML = '';
        const title = $id('nexusChatTitle'); if (title) title.textContent = 'Select a chat';
        await this._loadRooms();
    }

    // ── BLOCK ────────────────────────────────────────────────────────────────
    async toggleBlockUser(partnerId) {
        if (this.blockedUsers.includes(partnerId)) {
            await this.sb.from('blocked_users').delete().eq('blocker_id', this.userId).eq('blocked_id', partnerId);
            this.blockedUsers = this.blockedUsers.filter(id => id !== partnerId);
            alert('User unblocked.');
        } else {
            await this.sb.from('blocked_users').insert({ blocker_id: this.userId, blocked_id: partnerId });
            this.blockedUsers.push(partnerId);
            alert('User blocked.');
        }
    }

    startVoiceCall() {
        if (!this.currentRoomId) return;
        this.callMgr.startCall(this.currentRoomId, false).catch(e => console.error('Call error:', e));
    }

    startVideoCall() {
        if (!this.currentRoomId) return;
        this.callMgr.startCall(this.currentRoomId, true).catch(e => console.error('Call error:', e));
    }

    // ── PROFILES ─────────────────────────────────────────────────────────────
    async openProfileModal(uid) {
        if (!uid) return;
        const modal = $id('nexusProfileModal');
        if (!modal) return;

        const { data: p } = await this.sb.from('profiles').select('*').eq('id', uid).single();
        if (!p) return;

        $id('nexusProfileName').textContent = p.full_name || 'User';
        $id('nexusProfileEmail').textContent = p.email || 'No email';
        const av = $id('nexusProfileAvatar');
        if (av) {
            av.textContent = nexusInitials(p.full_name || p.email);
            if (p.avatar_url) av.style.backgroundImage = `url(${p.avatar_url})`;
            else av.style.backgroundImage = '';
        }

        const chatBtn = $id('nexusProfileChatBtn');
        if (chatBtn) {
            chatBtn.onclick = () => {
                modal.classList.remove('show');
                this.startDM(p.id, p.full_name || p.email);
            };
        }

        modal.classList.add('show');
    }

    async _populateRoomInfo() {
        if (!this.currentRoomId) return;
        const room = this.rooms.find(r => r.id === this.currentRoomId);
        if (!room) return;

        // Get members
        const { data: members } = await this.sb.from('chat_room_members').select('created_at, role, user_id, profiles(full_name, avatar_url, email)').eq('room_id', this.currentRoomId);

        // Populate Info Tab
        const infoContainer = $id('nexusViewInfo');
        if (infoContainer) {
            infoContainer.innerHTML = `
            <div class="nexus-cbar-section">
                    <div class="nexus-cbar-room-avatar" style="width:100px; height:100px; background:var(--nexus-primary); border-radius:12px; margin: 0 auto 16px; display:flex; align-items:center; justify-content:center; font-size:40px; color:white; font-weight:700;">
                        ${nexusEsc(nexusInitials(room.name))}
                    </div>
                    <h3 style="text-align:center; margin:0; font-size:18px; color:#fff;">${nexusEsc(room.name)}</h3>
                    <p style="text-align:center; color:#8f9bc0; font-size:13px; margin:4px 0 20px;">${room.type === 'channel' ? 'Public Channel' : room.type === 'assistant' ? 'AI Assistant' : 'Direct Message'}</p>
                </div>
            <div class="nexus-cbar-section" style="border-top: 1px solid rgba(255,255,255,0.08); padding-top:20px; margin-top:20px;">
                <h4 style="font-size:14px; margin-bottom:12px; color:#c5cbe3;">Channel Statistics</h4>
                <div style="font-size:13px; color:#8f9bc0; display:flex; justify-content:space-between; margin-bottom:8px;">
                    <span>Members</span> <span style="color:#fff;">${members?.length || 0}</span>
                </div>
                <div style="font-size:13px; color:#8f9bc0; display:flex; justify-content:space-between;">
                    <span>Privacy</span> <span style="color:#fff;">${room.type === 'channel' ? 'Public' : 'Private'}</span>
                </div>
            </div>
        `;
        }

        // Populate Members Tab
        const membersContainer = $id('nexusMemberListContainer');
        if (membersContainer) {
            // Note: In a real app we'd use Supabase Realtime presence. Here we simulate online randomly or use a flat green dot for demonstration if last_seen isn't tracked.
            // For now, assume current user is online, others random or green.
            membersContainer.innerHTML = (members || []).map(m => {
                const isOnline = m.user_id === this.userId || Math.random() > 0.5; // Simulate presence
                const color = isOnline ? '#2ecc71' : '#ff5252';
                const date = new Date(m.created_at).toLocaleDateString();
                return `
            <div style="display:flex; align-items:center; gap:12px; padding:10px; background:rgba(255,255,255,0.02); border-radius:12px;">
                    <div style="position:relative;">
                        <div class="nexus-dm-avatar" style="width:36px; height:36px; font-size:12px;">${nexusEsc(nexusInitials(m.profiles?.full_name || m.profiles?.email || '?'))}</div>
                        <div style="position:absolute; bottom:-2px; right:-2px; width:12px; height:12px; border-radius:50%; background:${color}; border:2px solid #161c2d;" title="${isOnline ? 'Online' : 'Offline'}"></div>
                    </div>
                    <div style="flex:1; overflow:hidden;">
                        <div style="font-size:13px; font-weight:600; color:#fff; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${nexusEsc(m.profiles?.full_name || m.profiles?.email || 'Unknown')}</div>
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-top:2px;">
                            <span style="font-size:11px; color:#7c4dff; font-weight:600;">${nexusEsc(m.role || 'Member')}</span>
                            <span style="font-size:10px; color:#6b7390;">Joined ${date}</span>
                        </div>
                    </div>
                </div>
            `;
            }).join('');
        }
    }
}




function _nexusAttachEvents(ctrl) {
    const $ = (id) => document.getElementById(id);

    const closeSidebar = () => {
        const sb = $('nexusSidebar');
        if (sb) sb.classList.remove('open');
        document.body.classList.remove('sidebar-open');
    };

    // Sidebar Toggle (Desktop Collapse / Mobile Close)
    $('nexusSidebarToggle')?.addEventListener('click', (e) => {
        e.stopPropagation();
        const sb = $('nexusSidebar');
        if (sb) {
            if (sb.classList.contains('open')) {
                closeSidebar();
            } else {
                sb.classList.toggle('collapsed');
            }
        }
    });


    // Mobile Sidebar Toggle (Open Drawer)
    $('nexusMobileToggle')?.addEventListener('click', (e) => {
        e.stopPropagation();
        const sb = $('nexusSidebar');
        if (sb) {
            sb.classList.remove('collapsed');
            sb.classList.add('open');
            document.body.classList.add('sidebar-open');
        }
    });

    // Mobile Sidebar Overlay Close
    $('nexusSidebarOverlay')?.addEventListener('click', closeSidebar);

    // Mobile Sidebar Close Button
    $('nexusSidebarClose')?.addEventListener('click', (e) => {
        e.stopPropagation();
        closeSidebar();
    });

    // OPEN SETTINGS V3
    $('nexusOpenSettingsV3')?.addEventListener('click', () => {
        ctrl.openSettingsV3();
        closeSidebar();
    });

    // CLOSE SETTINGS V3
    $('nexusCloseSettingsV3')?.addEventListener('click', () => {
        ctrl.closeSettingsV3();
    });

    // SETTINGS NAV TOGGLE
    document.querySelectorAll('.settings-nav-item').forEach(btn => {
        btn.onclick = () => ctrl.handleSettingsNav(btn);
    });

    // PROFILE ACTIONS V3
    $('btnSaveProfileV3')?.addEventListener('click', () => ctrl.saveProfileV3());
    $('btnEditAvatarV3')?.addEventListener('click', () => $('settingsAvatarInputV3')?.click());
    $('settingsAvatarInputV3')?.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) ctrl.updateAvatarV3(file);
    });

    // APPEARANCE V3
    document.querySelectorAll('.theme-btn').forEach(btn => {
        btn.onclick = () => {
            const theme = btn.dataset.theme;
            ctrl.saveSettingsV3({ theme });
        };
    });

    document.querySelectorAll('#accentPresets .color-swatch-v3:not(.custom)').forEach(swatch => {
        swatch.onclick = () => {
            ctrl.saveSettingsV3({ accent_color: swatch.dataset.color });
        };
    });

    $('accentPresets')?.querySelector('.color-swatch-v3.custom')?.addEventListener('click', () => {
        $('accentCustomColor')?.click();
    });

    $('accentCustomColor')?.addEventListener('change', (e) => {
        ctrl.saveSettingsV3({ accent_color: e.target.value });
    });

    $('settingsFontSize')?.addEventListener('change', (e) => {
        ctrl.saveSettingsV3({ font_size: e.target.value });
    });

    // CHAT SETTINGS V3
    $('settingsShowTime')?.addEventListener('change', (e) => {
        ctrl.saveSettingsV3({ show_timestamps: e.target.checked });
    });

    $('settingsCompactMode')?.addEventListener('change', (e) => {
        ctrl.saveSettingsV3({ compact_mode: e.target.checked });
    });

    $('btnPreviewBg')?.addEventListener('click', () => {
        const url = $('settingsChatBgInp')?.value;
        ctrl.saveSettingsV3({ chat_bg_url: url });
    });

    $('settingsBubbleInColor')?.addEventListener('change', (e) => {
        ctrl.saveSettingsV3({ incoming_bubble_color: e.target.value });
    });

    $('settingsBubbleOutColor')?.addEventListener('change', (e) => {
        ctrl.saveSettingsV3({ outgoing_bubble_color: e.target.value });
    });

    // GLOBAL MODAL DISMISS (Backdrop & ESC)
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            const settingsModal = $('nexusSettingsModalV3');
            if (settingsModal?.classList.contains('show')) ctrl.closeSettingsV3();
            // Add other modals here if they should close on ESC
            document.querySelectorAll('.nexus-modal.show').forEach(m => m.classList.remove('show'));
            document.body.style.overflow = '';
        }
    });

    document.querySelectorAll('.nexus-modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                if (modal.id === 'nexusSettingsModalV3') ctrl.closeSettingsV3();
                else {
                    modal.classList.remove('show');
                    document.body.style.overflow = '';
                }
            }
        });
    });


    // Mobile Back Button (Chat to Sidebar)
    $('nexusBackBtn')?.addEventListener('click', () => {
        const root = $('nexusChatRoot');
        if (root) root.classList.remove('chat-active');
        const sb = $('nexusSidebar');
        if (sb) {
            sb.classList.remove('collapsed');
            sb.classList.add('open');
        }
    });


    // Header Search Toggle
    $('nexusSearchToggleBtn')?.addEventListener('click', () => {
        const bar = $('nexusInlineSearchBar');
        if (bar) {
            bar.style.display = bar.style.display === 'none' ? 'flex' : 'none';
            if (bar.style.display === 'flex') $('nexusMsgSearch')?.focus();
        }
    });

    $('nexusCloseSearchBtn')?.addEventListener('click', () => {
        const bar = $('nexusInlineSearchBar');
        if (bar) bar.style.display = 'none';
        const searchInput = $('nexusMsgSearch');
        if (searchInput) searchInput.value = '';
        document.querySelectorAll('.nexus-msg-row').forEach(m => m.style.display = 'flex');
    });

    // Contextual Bar Toggle
    $('nexusInfoToggleBtn')?.addEventListener('click', () => {
        const cbar = $('nexusContextualBar');
        if (cbar) {
            const isMobile = window.innerWidth <= 768;
            if (isMobile) {
                cbar.style.display = 'flex';
                setTimeout(() => cbar.classList.add('open'), 10);
                ctrl._populateRoomInfo();
            } else {
                cbar.style.display = cbar.style.display === 'none' ? 'flex' : 'none';
                if (cbar.style.display === 'flex') ctrl._populateRoomInfo();
            }
        }
    });

    $('nexusCloseCBar')?.addEventListener('click', () => {
        const cbar = $('nexusContextualBar');
        if (cbar) {
            const isMobile = window.innerWidth <= 768;
            if (isMobile) {
                cbar.classList.remove('open');
                setTimeout(() => { if (!cbar.classList.contains('open')) cbar.style.display = 'none'; }, 300);
            } else {
                cbar.style.display = 'none';
            }
        }
    });

    // Contextual Tabs
    $('nexusTabInfo')?.addEventListener('click', () => {
        $('nexusTabInfo').classList.add('active');
        $('nexusTabInfo').style.borderBottom = '2px solid #7c4dff';
        $('nexusTabInfo').style.color = '#fff';

        const tabMembers = $('nexusTabMembers');
        if (tabMembers) {
            tabMembers.classList.remove('active');
            tabMembers.style.borderBottom = 'none';
            tabMembers.style.color = '#8f9bc0';
        }

        const vInfo = $('nexusViewInfo'); if (vInfo) vInfo.style.display = 'block';
        const vMembers = $('nexusViewMembers'); if (vMembers) vMembers.style.display = 'none';
    });

    $('nexusTabMembers')?.addEventListener('click', () => {
        $('nexusTabMembers').classList.add('active');
        $('nexusTabMembers').style.borderBottom = '2px solid #7c4dff';
        $('nexusTabMembers').style.color = '#fff';

        const tabInfo = $('nexusTabInfo');
        if (tabInfo) {
            tabInfo.classList.remove('active');
            tabInfo.style.borderBottom = 'none';
            tabInfo.style.color = '#8f9bc0';
        }

        const vInfo = $('nexusViewInfo'); if (vInfo) vInfo.style.display = 'none';
        const vMembers = $('nexusViewMembers'); if (vMembers) vMembers.style.display = 'flex';
    });

    $('nexusContextAddMemberBtn')?.addEventListener('click', () => {
        ctrl.openAddMemberModal();
    });

    $('nexusLeaveChannelBtn')?.addEventListener('click', () => {
        if (confirm('Are you sure you want to leave this channel?')) {
            ctrl.leaveChannel();
        }
    });

    // Sidebar Quick Search (Jump to)
    $('nexusSidebarSearch')?.addEventListener('input', (e) => {
        const q = e.target.value.toLowerCase();
        document.querySelectorAll('.nexus-room-item').forEach(item => {
            const name = item.querySelector('.nexus-item-name')?.innerText.toLowerCase() || '';
            item.style.display = name.includes(q) ? 'flex' : 'none';
        });
    });

    // Message Input & Mentions
    const input = $('nexusMsgInput');
    const mentionDropdown = $('nexusMentionDropdown');

    // Helper to insert mention
    window._execMention = (username) => {
        const input = $('nexusMsgInput');
        if (!input) return;
        const text = input.value;
        const lastAtIndex = text.lastIndexOf('@');
        if (lastAtIndex >= 0) {
            input.value = text.substring(0, lastAtIndex) + '@' + username + ' ';
        }
        mentionDropdown.style.display = 'none';
        input.focus();
    };

    if (input) {
        input.addEventListener('input', async (e) => {
            input.style.height = 'auto';
            input.style.height = (input.scrollHeight) + 'px';

            const val = e.target.value;
            const lastWord = val.split(/\s/).pop();

            if (lastWord.startsWith('@')) {
                const q = lastWord.substring(1).toLowerCase();
                try {
                    // Fetch existing members in this room
                    const { data: members } = await ctrl.sb.from('chat_room_members')
                        .select('profiles(full_name, email)')
                        .eq('room_id', ctrl.currentRoomId);

                    if (members && mentionDropdown) {
                        const matches = members.filter(m => {
                            const name = (m.profiles?.full_name || '').toLowerCase();
                            const email = (m.profiles?.email || '').toLowerCase();
                            return name.includes(q) || email.includes(q);
                        });

                        if (matches.length > 0) {
                            mentionDropdown.innerHTML = matches.map(m => {
                                const realName = m.profiles?.full_name || m.profiles?.email || 'Unknown';
                                const strippedName = realName.replace(/\s+/g, ''); // no spaces for tag
                                return `
            <div style="display:flex;align-items:center;padding:8px;cursor:pointer;border-radius:8px;" onmouseover="this.style.background='rgba(255,255,255,0.05)'" onmouseout="this.style.background='transparent'" onclick="window._execMention('${nexusEsc(strippedName)}')">
                                    <div class="nexus-dm-avatar" style="width:24px;height:24px;font-size:0.75rem;margin-right:8px;">${nexusEsc(nexusInitials(realName))}</div>
                                    <span style="font-size:0.85rem;color:#c5cbe3;">${nexusEsc(realName)}</span>
                                </div>
            `;
                            }).join('');
                            mentionDropdown.style.display = 'flex';
                        } else {
                            mentionDropdown.style.display = 'none';
                        }
                    }
                } catch (err) {
                    console.error('Mention error', err);
                }
            } else {
                if (mentionDropdown) mentionDropdown.style.display = 'none';
            }
        });

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                ctrl.sendMessage();
                input.style.height = 'auto';
                if (mentionDropdown) mentionDropdown.style.display = 'none';
            }
            if (e.key === 'Escape' && mentionDropdown) {
                mentionDropdown.style.display = 'none';
            }
        });
    }

    $('nexusSendBtn')?.addEventListener('click', () => {
        ctrl.sendMessage();
        if (input) input.style.height = 'auto';
        if (mentionDropdown) mentionDropdown.style.display = 'none';
    });

    // Toolbar Buttons
    $('nexusEmojiBtn')?.addEventListener('click', () => {
        const picker = $('nexusEmojiPicker');
        if (!picker) return;
        if (picker.style.display === 'flex') {
            picker.style.display = 'none';
        } else {
            // Render basic emojis if empty
            if (picker.innerHTML === '') {
                const emojis = [
                    '😀', '😂', '🥰', '😎', '🔥', '👍', '🎉', '👀', '🙌', '❤️',
                    '😁', '😅', '🤣', '😉', '😊', '😋', '😌', '😍', '😘', '😜',
                    '🤔', '😐', '😑', '😶', '🙄', '😏', '😣', '😥', '😮', '🤐',
                    '😯', '😪', '😫', '🥱', '😴', '😌', '😛', '😜', '😝', '🤤',
                    '😒', '😓', '😔', '😕', '🙃', '🤑', '😲', '☹️', '🙁', '😖',
                    '😞', '😟', '😤', '😢', '😭', '😦', '😧', '😨', '😩', '🤯',
                    '😬', '😰', '😱', '🥵', '🥶', '😳', '🤪', '😵', '😡', '😠',
                    '🤬', '😷', '🤒', '🤕', '🤢', '🤮', '🤧', '😇', '🥳', '🥺',
                    '🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯',
                    '🐸', '🐒', '🐔', '🐧', '🐦', '🐤', '🦋', '🐌', '🐛', '🐜',
                    '🍎', '🍐', '🍊', '🍋', '🍌', '🍉', '🍇', '🍓', '🍈', '🍒',
                    '🍔', '🍟', '🍕', '🌭', '🥪', '🌮', '🌯', '🥗', '🥘', '🥫',
                    '⚽️', '🏀', '🏈', '⚾️', '🥎', '🎾', '🏐', '🏉', '🥏', '🎱'
                ];
                picker.innerHTML = emojis.map(e => `<span style="cursor:pointer;font-size:1.4rem;padding:6px;border-radius:6px;transition:0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.1)'" onmouseout="this.style.background='transparent'" onclick="document.getElementById('nexusMsgInput').value += '${e}'">${e}</span>`).join('');
                
                picker.style.display = 'flex';
                picker.style.flexWrap = 'wrap';
                picker.style.gap = '5px';
                picker.style.padding = '12px';
                picker.style.height = '200px';
                picker.style.overflowY = 'auto';
                picker.style.alignContent = 'flex-start';
                picker.style.background = 'rgba(22,28,45,0.95)';
                picker.style.backdropFilter = 'blur(10px)';
                picker.style.border = '1px solid rgba(255,255,255,0.08)';
                picker.style.borderRadius = '12px';
                picker.style.boxShadow = '0 10px 40px rgba(0,0,0,0.5)';
            } else {
                picker.style.display = 'flex';
            }
            const menu = $('nexusAttachMenu');
            if (menu) menu.style.display = 'none';
        }
    });

    $('nexusBtnTag')?.addEventListener('click', () => {
        const input = $('nexusMsgInput');
        if (input) {
            input.value += '#';
            input.focus();
        }
    });

    $('nexusAttachBtn')?.addEventListener('click', () => {
        const menu = $('nexusAttachMenu');
        if (!menu) return;
        if (menu.style.display === 'flex') {
            menu.style.display = 'none';
        } else {
            menu.style.display = 'flex';
            const picker = $('nexusEmojiPicker');
            if (picker) picker.style.display = 'none';
        }
    });

    document.querySelectorAll('.nexus-attach-item').forEach(item => {
        item.addEventListener('click', () => {
            $('nexusAttachMenu').style.display = 'none';
            $('nexusFileInput')?.click();
        });
    });

    $('nexusFileInput')?.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (!ctrl.currentRoomId) { alert('Please select a chat first.'); return; }

        // Show a loading indicator in the message area
        const msgArea = $('nexusMessages');
        const loadingEl = document.createElement('div');
        loadingEl.className = 'nexus-msg-row';
        loadingEl.innerHTML = `
            <div class="nexus-msg-avatar-col"><div class="nexus-msg-avatar">${nexusEsc(nexusInitials(ctrl.userName))}</div></div>
            <div class="nexus-msg-content-col">
                <div class="nexus-msg-text" style="color:#9198b0;font-style:italic;">
                    <i class="fas fa-spinner fa-spin" style="margin-right:6px;"></i>
                    Uploading ${nexusEsc(file.name)}...
                </div>
            </div>`;
        if (msgArea) { msgArea.appendChild(loadingEl); msgArea.scrollTop = msgArea.scrollHeight; }

        try {
            const ext = file.name.split('.').pop();
            const safeFileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${ext}`;
            const path = `uploads/${ctrl.currentRoomId}/${safeFileName}`;

            const { data, error } = await ctrl.sb.storage.from('chat_attachments').upload(path, file, {
                cacheControl: '3600',
                upsert: false,
                contentType: file.type
            });
            loadingEl.remove();

            if (error) {
                console.error('Upload error:', error);
                alert(`Upload failed: ${error.message}\n\nMake sure the 'chat_attachments' bucket exists in Supabase Storage.`);
                return;
            }

            const { data: urlData } = ctrl.sb.storage.from('chat_attachments').getPublicUrl(path);
            const publicUrl = urlData?.publicUrl;

            if (!publicUrl) { alert('Could not get public URL.'); return; }

            // Insert message with file_url field for proper rendering
            const { error: msgErr } = await ctrl.sb.from('chat_messages').insert({
                room_id: ctrl.currentRoomId,
                sender_id: ctrl.userId,
                content: `[${file.name}](${publicUrl})`,
                file_url: publicUrl,
                file_name: file.name,
                message_type: 'file'
            });
            if (msgErr) console.error('File message insert error:', msgErr.message);


        } catch (err) {
            loadingEl.remove();
            console.error('File upload failed:', err);
            alert('Upload failed: ' + err.message);
        }
        e.target.value = '';
    });

    // WebRTC Call Controls
    $('nexusVoiceCallBtn')?.addEventListener('click', () => {
        if (!ctrl.currentRoomId) return;
        ctrl.callMgr.startCall(ctrl.currentRoomId, false);
    });

    $('nexusVideoCallBtn')?.addEventListener('click', () => {
        if (!ctrl.currentRoomId) return;
        ctrl.callMgr.startCall(ctrl.currentRoomId, true);
    });

    $('nexusEndCallBtn')?.addEventListener('click', () => {
        ctrl.callMgr.endCall(true);
    });

    $('nexusMuteBtn')?.addEventListener('click', () => {
        if (ctrl.callMgr && ctrl.callMgr.localStream) {
            const audioTrack = ctrl.callMgr.localStream.getAudioTracks()[0];
            if (audioTrack) {
                audioTrack.enabled = !audioTrack.enabled;
                const btn = $('nexusMuteBtn');
                if (btn) btn.style.opacity = audioTrack.enabled ? '1' : '0.5';
            }
        }
    });

    $('nexusVidOffBtn')?.addEventListener('click', () => {
        if (ctrl.callMgr && ctrl.callMgr.localStream) {
            const videoTrack = ctrl.callMgr.localStream.getVideoTracks()[0];
            if (videoTrack) {
                videoTrack.enabled = !videoTrack.enabled;
                const btn = $('nexusVidOffBtn');
                if (btn) btn.style.opacity = videoTrack.enabled ? '1' : '0.5';
            }
        }
    });

    // Channel Creation Modal — button ID is 'nexusBtnAddGroup' in HTML
    let selectedForGroup = [];
    // Wire BOTH possible button IDs in case HTML differs
    const createChannelBtn = $('nexusBtnAddGroup') || $('nexusBtnCreateChannel');
    if (createChannelBtn) {
        createChannelBtn.addEventListener('click', () => {
            $('nexusCreateGroupModal')?.classList.add('show');
            selectedForGroup = [];
            const srContainer = $('nexusSelectedMembers');
            if (srContainer) srContainer.innerHTML = '<span style="font-size:0.75rem;color:#6b7390;font-style:italic;">No members selected...</span>';
            const inp = $('nexusGroupNameInput');
            if (inp) inp.value = '';
            const search = $('nexusGroupSearchInput');
            if (search) search.value = '';
            const res = $('nexusGroupSearchResults');
            if (res) res.innerHTML = '';
        });
    }

    $('nexusCancelGroup')?.addEventListener('click', () => {
        $('nexusCreateGroupModal')?.classList.remove('show');
    });

    $('nexusGroupSearchInput')?.addEventListener('input', async (e) => {
        const q = e.target.value.trim();
        const res = $('nexusGroupSearchResults');
        if (!res) return;
        if (q.length < 1) { res.innerHTML = ''; return; }

        try {
            const { data } = await ctrl.sb.from('profiles')
                .select('id, full_name, email')
                .or(`full_name.ilike.%${q}%,email.ilike.%${q}%`)
                .neq('id', ctrl.userId)
                .limit(10);

            if (!data || data.length === 0) {
                res.innerHTML = '<div style="padding:10px;color:#8f9bc0;font-size:0.85rem;">No users found</div>';
                return;
            }

            res.innerHTML = data.map(u => `
                <div class="nexus-member-item" style="display:flex;align-items:center;padding:8px;border-bottom:1px solid rgba(255,255,255,0.05);cursor:pointer;" onclick="window._addTempGroupUser('${u.id}', '${nexusEsc(u.full_name || u.email)}')">
                    <div class="nexus-dm-avatar" style="width:30px;height:30px;font-size:0.9rem;margin-right:10px;">${nexusEsc(nexusInitials(u.full_name || u.email))}</div>
                    <div style="flex:1;">
                        <div style="font-size:0.9rem;color:#fff;">${nexusEsc(u.full_name || 'Unknown')}</div>
                        <div style="font-size:0.75rem;color:#8f9bc0;">${nexusEsc(u.email)}</div>
                    </div>
                </div>
            `).join('');
        } catch (err) {
            console.error('Search error:', err);
        }
    });

    window._addTempGroupUser = (id, name) => {
        if (!selectedForGroup.find(u => u.id === id)) {
            selectedForGroup.push({ id, name });
            const srContainer = $('nexusSelectedMembers');
            if (srContainer) {
                if (selectedForGroup.length === 1) srContainer.innerHTML = ''; // clear placeholder
                srContainer.innerHTML += `<span style="background:rgba(124,77,255,0.2);color:#c5cbe3;padding:4px 8px;border-radius:12px;font-size:0.8rem;display:flex;align-items:center;gap:4px;" id="tg_${id}">${nexusEsc(name)} <i class="fas fa-times" style="cursor:pointer;" onclick="window._rmTempGroupUser('${id}')"></i></span>`;
            }
        }
        const search = $('nexusGroupSearchInput');
        if (search) search.value = '';
        const res = $('nexusGroupSearchResults');
        if (res) res.innerHTML = '';
    };

    window._rmTempGroupUser = (id) => {
        selectedForGroup = selectedForGroup.filter(u => u.id !== id);
        const el = $(`tg_${id}`);
        if (el) el.remove();
        if (selectedForGroup.length === 0) {
            const srContainer = $('nexusSelectedMembers');
            if (srContainer) srContainer.innerHTML = '<span style="font-size:0.75rem;color:#6b7390;font-style:italic;">No members selected...</span>';
        }
    };

    $('nexusSaveGroup')?.addEventListener('click', async () => {
        const name = $('nexusGroupNameInput')?.value.trim();
        if (!name) return alert('Please enter a channel name.');

        try {
            // Create Room
            const { data: room, error: roomErr } = await ctrl.sb.from('chat_rooms')
                .insert({
                    name: name,
                    type: 'channel',
                    scope: 'channel',
                    created_by: ctrl.userId
                })
                .select('id').single();

            if (roomErr) throw roomErr;

            // Prepare members (Creator + Selected)
            const membersToInsert = [
                { room_id: room.id, user_id: ctrl.userId, role: 'admin' },
                ...selectedForGroup.map(u => ({ room_id: room.id, user_id: u.id, role: 'member' }))
            ];

            const { error: memErr } = await ctrl.sb.from('chat_room_members').insert(membersToInsert);
            if (memErr) throw memErr;

            alert('Channel created successfully!');
            $('nexusCreateGroupModal')?.classList.remove('show');
            await ctrl._loadRooms();
            ctrl.openRoom(room.id);
            const sbElem = document.getElementById('nexusSidebar');
            if (sbElem) sbElem.classList.remove('open');
        } catch (err) {
            console.error('Error creating channel:', err);
            alert('Failed to create channel.');
        }
    });

    // Add Member Modal
    $('nexusCloseAddPeople')?.addEventListener('click', () => {
        $('nexusAddMemberModal')?.classList.remove('show');
    });

    $('nexusAddPeopleSearch')?.addEventListener('input', async (e) => {
        const q = e.target.value.trim();
        const res = $('nexusAddPeopleResults');
        if (!res) return;
        if (q.length < 1) { res.innerHTML = ''; return; }

        try {
            // Search profiles
            const users = await ctrl.searchAddMembers(q);

            // Filter out existing members from the search results
            const { data: existingMembers } = await ctrl.sb.from('chat_room_members')
                .select('user_id')
                .eq('room_id', ctrl.currentRoomId);

            const existingIds = existingMembers ? existingMembers.map(m => m.user_id) : [];
            const availableUsers = users.filter(u => u.id !== ctrl.userId && !existingIds.includes(u.id));

            if (!availableUsers || availableUsers.length === 0) {
                res.innerHTML = '<div style="padding:10px;color:#8f9bc0;font-size:0.85rem;">No unjoined users found</div>';
                return;
            }

            res.innerHTML = availableUsers.map(u => `
                <div class="nexus-member-item" style="display:flex;align-items:center;padding:8px;border-bottom:1px solid rgba(255,255,255,0.05);cursor:pointer;" onclick="window._execAddMember('${u.id}')">
                    <div class="nexus-dm-avatar" style="width:30px;height:30px;font-size:0.9rem;margin-right:10px;">${nexusEsc(nexusInitials(u.full_name || u.email))}</div>
                    <div style="flex:1;">
                        <div style="font-size:0.9rem;color:#fff;">${nexusEsc(u.full_name || 'Unknown')}</div>
                        <div style="font-size:0.75rem;color:#8f9bc0;">${nexusEsc(u.email)}</div>
                    </div>
                    <i class="fas fa-plus" style="color:#2ecc71;"></i>
                </div>
            `).join('');
        } catch (err) {
            console.error('Search error:', err);
        }
    });

    window._execAddMember = async (userId) => {
        await ctrl.addMemberToRoom(userId);
        $('nexusAddMemberModal')?.classList.remove('show');
        // Refresh the members view
        const cbar = $('nexusContextualBar');
        if (cbar && cbar.style.display !== 'none') {
            await ctrl._populateRoomInfo();
        }
    };

    // Browse Channels Modal
    $('nexusBtnJoinChannel')?.addEventListener('click', async () => {
        $('nexusBrowseChannelsModal')?.classList.add('show');
        const searchInput = $('nexusBrowseChannelsSearch');
        if (searchInput) searchInput.value = '';
        await _loadAvailableChannels('');
    });

    $('nexusCloseBrowseChannels')?.addEventListener('click', () => {
        $('nexusBrowseChannelsModal')?.classList.remove('show');
    });

    $('nexusBrowseChannelsSearch')?.addEventListener('input', async (e) => {
        const q = e.target.value.trim();
        await _loadAvailableChannels(q);
    });

    async function _loadAvailableChannels(query) {
        const res = $('nexusBrowseChannelsResults');
        if (!res) return;
        res.innerHTML = '<div style="padding:15px; text-align:center; color:#8f9bc0; font-style:italic;">Loading...</div>';

        try {
            // Get channels user is NOT already in.
            // Simplified approach: Get all public channels, filter out ones in ctrl.rooms
            let qb = ctrl.sb.from('chat_rooms').select('id, name, created_at, chat_room_members(count)').eq('type', 'channel').eq('scope', 'channel');

            if (query && query.length > 0) {
                qb = qb.ilike('name', `%${query}%`);
            }

            const { data: allChannels, error } = await qb.limit(20);
            if (error) throw error;

            const existingIds = ctrl.rooms.map(r => r.id);

            if (!allChannels || allChannels.length === 0) {
                res.innerHTML = '<div style="padding:15px; text-align:center; color:#8f9bc0; font-style:italic;">No channels found.</div>';
                return;
            }

            res.innerHTML = allChannels.map(ch => {
                const isJoined = existingIds.includes(ch.id);
                return `
                <div class="nexus-member-item" style="display:flex;align-items:center;padding:12px;background:rgba(255,255,255,0.02);border-radius:12px;cursor:${isJoined ? 'default' : 'pointer'}; opacity:${isJoined ? '0.7' : '1'}"
                     ${isJoined ? '' : `onclick="window._execJoinChannel('${ch.id}')"`}>
                    <div class="nexus-dm-avatar" style="width:40px;height:40px;font-size:1.2rem;margin-right:12px;background:${isJoined ? '#4a5568' : '#7c4dff'};">#</div>
                    <div style="flex:1;">
                        <div style="font-size:1rem;color:#fff;font-weight:600;">${nexusEsc(ch.name)}</div>
                        <div style="font-size:0.75rem;color:#8f9bc0;">Public Channel</div>
                    </div>
                    ${isJoined
                        ? `<span style="color:#2ecc71; font-size:0.85rem; font-weight:600;"><i class="fas fa-check-circle"></i> Joined</span>`
                        : `<button class="nexus-modal-btn primary" style="padding:6px 16px; font-size:0.85rem;" onclick="event.stopPropagation(); window._execJoinChannel('${ch.id}')">Join</button>`
                    }
                </div>
                `;
            }).join('');

        } catch (err) {
            console.error('Error fetching channels:', err);
            res.innerHTML = '<div style="padding:15px; text-align:center; color:#ff5252; font-style:italic;">Failed to load channels</div>';
        }
    }

    window._execJoinChannel = async (roomId) => {
        try {
            const { error } = await ctrl.sb.from('chat_room_members').insert({
                room_id: roomId,
                user_id: ctrl.userId,
                role: 'member'
            });
            if (error) throw error;

            $('nexusBrowseChannelsModal')?.classList.remove('show');
            await ctrl._loadRooms();
            ctrl.openRoom(roomId);
            const sbElem = document.getElementById('nexusSidebar');
            if (sbElem) sbElem.classList.remove('open');
        } catch (err) {
            console.error('Join channel error:', err);
            alert('Failed to join channel.');
        }
    };

    // Direct Message Modal
    $('nexusBtnAddDM')?.addEventListener('click', () => {
        $('nexusDMModal')?.classList.add('show');
        const input = $('nexusDMSearchInput');
        if (input) input.value = '';
        const res = $('nexusDMResults');
        if (res) res.innerHTML = '';

        // Auto-load existing connections
        _loadContactList('');
    });

    $('nexusCancelDM')?.addEventListener('click', () => {
        $('nexusDMModal')?.classList.remove('show');
    });

    $('nexusDMSearchInput')?.addEventListener('input', (e) => {
        const q = e.target.value.trim();
        _loadContactList(q);
    });

    async function _loadContactList(query) {
        const res = $('nexusDMResults');
        if (!res) return;

        try {
            // Priority 1: Get existing connected users
            let connectedIds = new Set();
            for (const r of ctrl.rooms) {
                if (r.type === 'direct') {
                    // Extract the other user's ID
                    try {
                        const { data: members } = await ctrl.sb.from('chat_room_members').select('user_id').eq('room_id', r.id).neq('user_id', ctrl.userId);
                        if (members && members.length > 0) connectedIds.add(members[0].user_id);
                    } catch (e) { } // Ignore silently
                }
            }

            let qb = ctrl.sb.from('profiles').select('id, full_name, email').neq('id', ctrl.userId);
            if (query && query.length > 0) {
                qb = qb.or(`full_name.ilike.%${query}%,email.ilike.%${query}%`);
            } else if (connectedIds.size > 0) {
                // If no query, show recent contacts
                qb = qb.in('id', Array.from(connectedIds));
            } else {
                res.innerHTML = '<div style="padding:10px;text-align:center;color:#8f9bc0;font-size:0.85rem;">Type a name to start searching</div>';
                return;
            }

            const { data, error } = await qb.limit(10);
            if (error) throw error;

            if (!data || data.length === 0) {
                res.innerHTML = '<div style="padding:10px;text-align:center;color:#8f9bc0;font-size:0.85rem;">No contacts found</div>';
                return;
            }

            res.innerHTML = data.map(u => `
                <div class="nexus-member-item" style="display:flex;align-items:center;padding:12px;background:rgba(255,255,255,0.02);border-radius:12px;cursor:pointer;margin-bottom:8px;" onclick="window._execStartDM('${u.id}')">
                    <div class="nexus-dm-avatar" style="width:40px;height:40px;font-size:1.2rem;margin-right:12px;">${nexusEsc(nexusInitials(u.full_name || u.email))}</div>
                    <div style="flex:1;">
                        <div style="font-size:1rem;color:#fff;font-weight:600;">${nexusEsc(u.full_name || 'Unknown')}</div>
                        <div style="font-size:0.75rem;color:#8f9bc0;">${nexusEsc(u.email)}</div>
                    </div>
                    <i class="fas fa-comment-dots" style="color:#7c4dff;"></i>
                </div>
            `).join('');

        } catch (err) {
            console.error('Contact load error:', err);
        }
    }

    window._execStartDM = async (userId) => {
        try {
            // First check if a DM room already exists between these users
            const existingRoom = ctrl.rooms.find(r => r.type === 'direct' && r.partnerId === userId);
            if (existingRoom) {
                const dmModal = document.getElementById('nexusDMModal');
                if (dmModal) dmModal.classList.remove('show');
                ctrl.openRoom(existingRoom.id);
                return;
            }

            // We use startDM heavily now
            ctrl.startDM(userId, 'Direct Message');
            const dmModal = document.getElementById('nexusDMModal');
            if (dmModal) dmModal.classList.remove('show');

        } catch (err) {
            console.error('Error starting DM:', err);
            alert('Failed to start direct message.');
        }
    };

    // Broadcast Modal
    $('nexusBtnBroadcast')?.addEventListener('click', () => {
        $('nexusBroadcastModal')?.classList.add('show');
    });

    $('nexusCancelBroadcast')?.addEventListener('click', () => {
        $('nexusBroadcastModal')?.classList.remove('show');
    });

    $('nexusSendBroadcast')?.addEventListener('click', async () => {
        const target = $('nexusBroadcastTarget').value;
        const msg = $('nexusBroadcastMsg').value.trim();
        if (!msg) return alert('Message cannot be empty');

        try {
            let query = ctrl.sb.from('chat_rooms').select('id').eq('type', 'channel');
            if (target === 'students') query = query.eq('scope', 'student');
            if (target === 'admins') query = query.eq('scope', 'admin');

            const { data: channels, error } = await query;
            if (error) throw error;
            if (!channels || channels.length === 0) {
                alert('No matching channels found to broadcast.');
                return;
            }

            const inserts = channels.map(c => ({
                room_id: c.id,
                sender_id: ctrl.userId,
                content: msg,
                message_type: 'bulk_broadcast'
            }));

            const { error: insertErr } = await ctrl.sb.from('chat_messages').insert(inserts);
            if (insertErr) throw insertErr;

            alert('Broadcast sent to ' + channels.length + ' channel(s).');
            $('nexusBroadcastModal').classList.remove('show');
            $('nexusBroadcastMsg').value = '';
        } catch (e) {
            console.error('Broadcast error:', e);
            alert('Failed to send broadcast.');
        }
    });

    // Modals & Backdrops
    $('nexusCloseProfile')?.addEventListener('click', () => $('nexusProfileModal').classList.remove('show'));
    $('nexusCloseAddPeople')?.addEventListener('click', () => $('nexusAddPeopleModal').classList.remove('show'));

    // GLOBAL BACKDROP CLICK (Close Modals)
    window.addEventListener('click', (e) => {
        if (e.target.classList.contains('nexus-modal')) {
            e.target.classList.remove('show');
        }
    });

    // GLOBAL KEYBOARD SHORTCUTS
    window.addEventListener('keydown', (e) => {
        // ESC to close modals
        if (e.key === 'Escape') {
            document.querySelectorAll('.nexus-modal:not(.nexus-auth-modal)').forEach(m => m.classList.remove('show'));
        }
        // Ctrl + K to focus search
        if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
            e.preventDefault();
            const search = $('nexusSidebarSearch') || $('nexusSearchRooms');
            if (search) search.focus();
        }
    });

    // Other Existing Actions
    $('nexusVoiceCallBtn')?.addEventListener('click', () => ctrl.startVoiceCall());
    $('nexusVideoCallBtn')?.addEventListener('click', () => ctrl.startVideoCall());
    $('nexusBtnAddPeople')?.addEventListener('click', () => ctrl.openAddMemberModal());

    console.log('✅ Nexus interactive events attached');
}

// ─── ENTRY POINT ─────────────────────────────────────────────────────────────
window.initNexusChat = async function (role) {
    if (window.nexusInitInProgress) {
        console.warn('NexusChatUI: Initialization already in progress');
        return;
    }
    window.nexusInitInProgress = true;

    console.log('initNexusChat: Starting entry point flow');
    try {
        const sb = window.supabase;
        if (!sb) {
            console.error('initNexusChat: Supabase not found on window');
            window.nexusInitInProgress = false;
            return;
        }

        console.log('initNexusChat: Getting user session');
        const { data: { user }, error } = await sb.auth.getUser();
        if (error || !user) {
            console.warn('initNexusChat: Not authenticated');
            window.nexusInitInProgress = false;
            return;
        }

        console.log('initNexusChat: Synchronizing profile for user:', user.id);
        const { data: profile } = await sb.from('profiles').select('full_name, email, role').eq('id', user.id).single();
        const userName = profile?.full_name || profile?.email || user.email || 'User';
        const userRole = role || profile?.role || 'user';

        console.log('initNexusChat: Creating NexusChatUI instance');
        const ctrl = new NexusChatUI(sb, user.id, userRole, userName);
        window.nexusChatCtrl = ctrl;

        console.log('initNexusChat: Attaching event listeners');
        _nexusAttachEvents(ctrl);

        console.log('initNexusChat: Triggering ctrl.init()');
        await ctrl.init();

        console.log('initNexusChat: Success');
    } catch (err) {
        console.error('initNexusChat: FATAL EXCEPTION:', err);
    } finally {
        window.nexusInitInProgress = false;
    }
};

