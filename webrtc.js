export class WebRTCManager {
    constructor(supabase, userId, userName) {
        this.supabase = supabase;
        this.userId = userId;
        this.userName = userName;
        this.localStream = null;
        this.peerConnection = null;
        this.callChannel = null;
        this.currentRoomId = null;
        this.isVideoCall = false;

        this.servers = {
            iceServers: [
                { urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'] }
            ]
        };

        this.injectCallUI();
        this.initGlobalListener();
    }

    injectCallUI() {
        if (document.getElementById('webrtcCallModal')) return;

        const modalHtml = `
        <div id="webrtcCallModal" class="fixed inset-0 bg-slate-900/95 backdrop-blur-md z-[9999] hidden flex-col items-center justify-center">
            <div class="relative w-full max-w-4xl aspect-video bg-black rounded-3xl overflow-hidden shadow-2xl border border-white/10 flex items-center justify-center">
                <!-- Remote Video -->
                <video id="remoteVideo" autoplay playsinline class="w-full h-full object-cover hidden"></video>
                <div id="remoteAudioOnly" class="absolute inset-0 flex flex-col items-center justify-center bg-slate-800 text-white hidden">
                    <div class="w-24 h-24 rounded-full bg-blue-600 flex items-center justify-center text-4xl mb-4 shadow-xl">
                        <span class="material-symbols-outlined text-[48px]">person</span>
                    </div>
                    <h3 id="callTargetName" class="text-2xl font-bold">Calling...</h3>
                    <p class="text-sm text-slate-400 mt-2" id="callStatusText">Connecting</p>
                </div>
                
                <!-- Local Video -->
                <video id="localVideo" autoplay playsinline muted class="absolute bottom-6 right-6 w-48 aspect-video bg-slate-800 object-cover rounded-2xl border-2 border-white/20 shadow-xl hidden"></video>
                
                <!-- Controls -->
                <div class="absolute bottom-8 left-1/2 transform -translate-x-1/2 flex items-center gap-4 bg-slate-900/80 backdrop-blur-lg px-8 py-4 rounded-full border border-white/10">
                    <button id="webrtcToggleMic" class="w-12 h-12 rounded-full bg-slate-700 hover:bg-slate-600 text-white flex items-center justify-center transition-colors">
                        <span class="material-symbols-outlined">mic</span>
                    </button>
                    <button id="webrtcToggleVid" class="w-12 h-12 rounded-full bg-slate-700 hover:bg-slate-600 text-white flex items-center justify-center transition-colors">
                        <span class="material-symbols-outlined">videocam</span>
                    </button>
                    <div class="w-px h-8 bg-white/20 mx-2"></div>
                    <button id="webrtcHangup" class="w-16 h-12 rounded-full bg-red-500 hover:bg-red-400 text-white flex items-center justify-center transition-colors shadow-lg shadow-red-500/30">
                        <span class="material-symbols-outlined">call_end</span>
                    </button>
                </div>
            </div>
        </div>

        <div id="webrtcIncomingCall" class="fixed top-8 right-8 w-80 bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl z-[9999] hidden flex-col overflow-hidden animate-in slide-in-from-right-8 duration-300">
            <div class="p-6 flex flex-col items-center bg-gradient-to-b from-blue-900/20 to-transparent">
                <div class="w-20 h-20 rounded-full bg-blue-600 flex items-center justify-center text-3xl text-white mb-4 shadow-xl shadow-blue-500/20 animate-pulse">
                    <span class="material-symbols-outlined text-[36px]" id="incomingCallIcon">videocam</span>
                </div>
                <h4 class="text-white font-bold text-lg mb-1" id="incomingCallerName">Caller Name</h4>
                <p class="text-sm text-slate-400">Incoming <span id="incomingCallType">Video</span> Call...</p>
            </div>
            <div class="flex border-t border-slate-700 bg-slate-900/50">
                <button id="webrtcRejectCall" class="flex-1 py-4 text-red-400 hover:bg-red-500/10 hover:text-red-300 font-bold transition-colors">Decline</button>
                <div class="w-px bg-slate-700"></div>
                <button id="webrtcAcceptCall" class="flex-1 py-4 text-emerald-400 hover:bg-emerald-500/10 hover:text-emerald-300 font-bold transition-colors">Accept</button>
            </div>
        </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);

        // Bind UI handlers
        document.getElementById('webrtcHangup').onclick = () => this.endCall();
        document.getElementById('webrtcToggleMic').onclick = () => this.toggleMic();
        document.getElementById('webrtcToggleVid').onclick = () => this.toggleVideo();
        document.getElementById('webrtcRejectCall').onclick = () => this.rejectCall();
        document.getElementById('webrtcAcceptCall').onclick = () => this.acceptCall();
    }

    initGlobalListener() {
        // Listen on a personal channel for incoming calls
        this.globalChannel = this.supabase.channel(`webrtc-user-${this.userId}`);
        this.globalChannel.on('broadcast', { event: 'incoming-call' }, (payload) => this.handleIncomingCall(payload))
            .subscribe();
    }

    async startCall(roomId, targetUserId, isVideo) {
        this.currentRoomId = roomId;
        this.isVideoCall = isVideo;
        this.showCallUI(true);
        document.getElementById('callStatusText').textContent = 'Dialing...';

        await this.setupMedia(isVideo);
        this.createPeerConnection();

        // Signal target user
        this.supabase.channel(`webrtc-user-${targetUserId}`).send({
            type: 'broadcast',
            event: 'incoming-call',
            payload: {
                callerId: this.userId,
                callerName: this.userName,
                roomId: roomId,
                isVideo: isVideo
            }
        });

        this.joinCallChannel(roomId);
    }

    async handleIncomingCall({ payload }) {
        if (this.currentRoomId) {
            // Already in a call, notify busy
            this.supabase.channel(`webrtc-user-${payload.callerId}`).send({
                type: 'broadcast',
                event: 'call-rejected',
                payload: { reason: 'busy' }
            });
            return;
        }

        this.incomingPayload = payload;

        const incModal = document.getElementById('webrtcIncomingCall');
        document.getElementById('incomingCallerName').textContent = payload.callerName;
        document.getElementById('incomingCallType').textContent = payload.isVideo ? 'Video' : 'Voice';
        document.getElementById('incomingCallIcon').textContent = payload.isVideo ? 'videocam' : 'call';
        incModal.classList.remove('hidden');
        incModal.classList.add('flex');
    }

    async acceptCall() {
        document.getElementById('webrtcIncomingCall').classList.add('hidden');
        document.getElementById('webrtcIncomingCall').classList.remove('flex');

        const p = this.incomingPayload;
        this.currentRoomId = p.roomId;
        this.isVideoCall = p.isVideo;

        this.showCallUI(false);
        document.getElementById('callStatusText').textContent = 'Connecting...';

        await this.setupMedia(p.isVideo);
        this.createPeerConnection();
        this.joinCallChannel(p.roomId);

        // Tell caller we accepted
        this.callChannel.send({
            type: 'broadcast',
            event: 'call-accepted',
            payload: { accepterId: this.userId }
        });
    }

    rejectCall() {
        document.getElementById('webrtcIncomingCall').classList.add('hidden');
        document.getElementById('webrtcIncomingCall').classList.remove('flex');

        if (this.incomingPayload) {
            this.supabase.channel(`webrtc-user-${this.incomingPayload.callerId}`).send({
                type: 'broadcast',
                event: 'call-rejected',
                payload: { reason: 'declined' }
            });
            this.incomingPayload = null;
        }
    }

    joinCallChannel(roomId) {
        if (this.callChannel) this.supabase.removeChannel(this.callChannel);

        this.callChannel = this.supabase.channel(`webrtc-room-${roomId}`);

        this.callChannel
            .on('broadcast', { event: 'call-accepted' }, async () => {
                document.getElementById('callStatusText').textContent = 'Connected';
                // Caller creates offer
                const offer = await this.peerConnection.createOffer();
                await this.peerConnection.setLocalDescription(offer);
                this.callChannel.send({ type: 'broadcast', event: 'webrtc-offer', payload: { offer } });
            })
            .on('broadcast', { event: 'call-rejected' }, () => {
                alert("Call was declined or user is busy.");
                this.endCall();
            })
            .on('broadcast', { event: 'webrtc-offer' }, async ({ payload }) => {
                await this.peerConnection.setRemoteDescription(new RTCSessionDescription(payload.offer));
                const answer = await this.peerConnection.createAnswer();
                await this.peerConnection.setLocalDescription(answer);
                this.callChannel.send({ type: 'broadcast', event: 'webrtc-answer', payload: { answer } });
            })
            .on('broadcast', { event: 'webrtc-answer' }, async ({ payload }) => {
                await this.peerConnection.setRemoteDescription(new RTCSessionDescription(payload.answer));
            })
            .on('broadcast', { event: 'webrtc-candidate' }, async ({ payload }) => {
                if (payload.candidate) {
                    await this.peerConnection.addIceCandidate(new RTCIceCandidate(payload.candidate));
                }
            })
            .on('broadcast', { event: 'call-ended' }, () => {
                this.endCall(false); // Don't broadcast end-call back
            })
            .subscribe();
    }

    createPeerConnection() {
        this.peerConnection = new RTCPeerConnection(this.servers);

        // Add local tracks
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => {
                this.peerConnection.addTrack(track, this.localStream);
            });
        }

        // Listen for remote tracks
        this.peerConnection.ontrack = (event) => {
            const remoteVid = document.getElementById('remoteVideo');
            remoteVid.srcObject = event.streams[0];
            remoteVid.classList.remove('hidden');
            document.getElementById('remoteAudioOnly').classList.add('hidden');
        };

        // ICE Candidates
        this.peerConnection.onicecandidate = (event) => {
            if (event.candidate && this.callChannel) {
                this.callChannel.send({
                    type: 'broadcast',
                    event: 'webrtc-candidate',
                    payload: { candidate: event.candidate }
                });
            }
        };
    }

    async setupMedia(isVideo) {
        try {
            this.localStream = await navigator.mediaDevices.getUserMedia({ video: isVideo, audio: true });

            if (isVideo) {
                const localVid = document.getElementById('localVideo');
                localVid.srcObject = this.localStream;
                localVid.classList.remove('hidden');
            }
        } catch (error) {
            console.error('Error accessing media devices.', error);
            alert('Cannot access microphone/camera');
        }
    }

    showCallUI(isCaller) {
        const modal = document.getElementById('webrtcCallModal');
        modal.classList.remove('hidden');
        modal.classList.add('flex');

        document.getElementById('callStatusText').textContent = isCaller ? 'Calling...' : 'Connecting...';
        document.getElementById('remoteVideo').classList.add('hidden');
        document.getElementById('remoteAudioOnly').classList.remove('hidden');
        document.getElementById('localVideo').classList.add('hidden');
    }

    toggleMic() {
        if (!this.localStream) return;
        const audioTrack = this.localStream.getAudioTracks()[0];
        if (audioTrack) {
            audioTrack.enabled = !audioTrack.enabled;
            const btn = document.getElementById('webrtcToggleMic');
            btn.innerHTML = audioTrack.enabled
                ? '<span class="material-symbols-outlined">mic</span>'
                : '<span class="material-symbols-outlined text-red-400">mic_off</span>';
            btn.classList.toggle('bg-slate-700', audioTrack.enabled);
            btn.classList.toggle('bg-slate-800', !audioTrack.enabled);
        }
    }

    toggleVideo() {
        if (!this.localStream) return;
        const videoTrack = this.localStream.getVideoTracks()[0];
        if (videoTrack) {
            videoTrack.enabled = !videoTrack.enabled;
            const btn = document.getElementById('webrtcToggleVid');
            btn.innerHTML = videoTrack.enabled
                ? '<span class="material-symbols-outlined">videocam</span>'
                : '<span class="material-symbols-outlined text-red-400">videocam_off</span>';
            btn.classList.toggle('bg-slate-700', videoTrack.enabled);
            btn.classList.toggle('bg-slate-800', !videoTrack.enabled);
        } else if (!this.isVideoCall) {
            alert("No video track available in voice call");
        }
    }

    endCall(broadcast = true) {
        if (this.peerConnection) {
            this.peerConnection.close();
            this.peerConnection = null;
        }
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
            this.localStream = null;
        }
        if (broadcast && this.callChannel) {
            this.callChannel.send({ type: 'broadcast', event: 'call-ended' });
        }

        if (this.callChannel) {
            this.supabase.removeChannel(this.callChannel);
            this.callChannel = null;
        }

        this.currentRoomId = null;
        this.isVideoCall = false;

        const modal = document.getElementById('webrtcCallModal');
        if (modal) {
            modal.classList.add('hidden');
            modal.classList.remove('flex');
        }

        const localVid = document.getElementById('localVideo');
        const remoteVid = document.getElementById('remoteVideo');
        if (localVid) localVid.srcObject = null;
        if (remoteVid) remoteVid.srcObject = null;
    }
}
