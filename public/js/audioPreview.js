class AudioPreview {
    constructor(videoPlayer) {
        if (!videoPlayer) {
            throw new Error('Video player is required');
        }
        this.videoPlayer = videoPlayer;
        this.audioContext = null;
        this.source = null;
        this.previewNode = null;
        this.isPreviewPlaying = false;
        this.currentTime = 0;
        this.previewDuration = 5; // Default preview duration in seconds
        this.previewTimeout = null;
        this.isSourceConnected = false; // Track if source is connected

        // Cache DOM elements
        this.previewButton = document.getElementById('previewAudioEffect');
        this.stopButton = document.getElementById('stopAudioPreview');
        this.effectSelect = document.getElementById('audioEffectType');
        this.durationInput = document.getElementById('previewDuration');
        this.durationDisplay = document.getElementById('previewTime');

        // Initialize Web Audio API
        this.initAudioContext();
        this.setupEventListeners();

        console.log('AudioPreview initialized with elements:', {
            previewButton: !!this.previewButton,
            stopButton: !!this.stopButton,
            effectSelect: !!this.effectSelect,
            durationInput: !!this.durationInput
        });
    }

    initAudioContext() {
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            this.audioContext = new AudioContext();
            console.log('AudioContext initialized');
        } catch (error) {
            console.error('Failed to initialize AudioContext:', error);
            throw new Error('Web Audio API not supported');
        }
    }

    setupEventListeners() {
        if (this.previewButton) {
            this.previewButton.addEventListener('click', () => {
                console.log('Preview button clicked');
                this.startPreview();
            });
        }

        if (this.stopButton) {
            this.stopButton.addEventListener('click', () => {
                console.log('Stop button clicked');
                this.stopPreview();
            });
        }

        if (this.effectSelect) {
            this.effectSelect.addEventListener('change', () => {
                console.log('Effect changed:', this.effectSelect.value);
                this.updatePreviewControls();
            });
        }

        if (this.durationInput) {
            this.durationInput.addEventListener('input', () => {
                this.previewDuration = parseInt(this.durationInput.value);
                if (this.durationDisplay) {
                    this.durationDisplay.textContent = this.previewDuration;
                }
                console.log('Preview duration changed:', this.previewDuration);
            });
        }

        // Resume AudioContext on user interaction
        document.addEventListener('click', () => {
            if (this.audioContext && this.audioContext.state === 'suspended') {
                this.audioContext.resume().then(() => {
                    console.log('AudioContext resumed');
                });
            }
        }, { once: true });
    }

    async startPreview() {
        try {
            console.log('Starting preview...');
            if (this.isPreviewPlaying) {
                console.log('Preview already playing, stopping first');
                this.stopPreview();
            }

            if (!this.effectSelect?.value) {
                console.log('No effect selected');
                return;
            }

            // Resume AudioContext if suspended
            if (this.audioContext.state === 'suspended') {
                await this.audioContext.resume();
            }

            // Create new audio source only if not already connected
            if (!this.isSourceConnected) {
                this.source = this.audioContext.createMediaElementSource(this.videoPlayer);
                this.isSourceConnected = true;
                console.log('Created new MediaElementSourceNode');
            }

            // Create and configure audio effects
            this.previewNode = await this.createAudioEffect(this.effectSelect.value);

            if (!this.previewNode) {
                throw new Error('Failed to create audio effect');
            }

            // Connect nodes
            if (this.source) {
                this.source.connect(this.previewNode);
                this.previewNode.connect(this.audioContext.destination);
            }

            // Update UI
            this.isPreviewPlaying = true;
            this.previewButton.disabled = true;
            this.stopButton.classList.remove('hidden');

            // Store current time and play video
            this.currentTime = this.videoPlayer.currentTime;
            this.videoPlayer.play();

            // Set timeout to stop preview
            this.previewTimeout = setTimeout(() => {
                this.stopPreview();
            }, this.previewDuration * 1000);

            console.log('Preview started successfully');
        } catch (error) {
            console.error('Error starting preview:', error);
            this.stopPreview();
            throw error;
        }
    }

    stopPreview() {
        console.log('Stopping preview...');
        try {
            // Clear timeout
            if (this.previewTimeout) {
                clearTimeout(this.previewTimeout);
                this.previewTimeout = null;
            }

            // Disconnect effect node but keep source
            if (this.previewNode) {
                this.previewNode.disconnect();
                this.previewNode = null;
            }

            // If source exists, connect it directly to destination
            if (this.source && this.isSourceConnected) {
                this.source.disconnect();
                this.source.connect(this.audioContext.destination);
            }

            // Reset video
            if (this.videoPlayer) {
                this.videoPlayer.pause();
                this.videoPlayer.currentTime = this.currentTime;
            }

            // Update UI
            this.isPreviewPlaying = false;
            if (this.previewButton) {
                this.previewButton.disabled = false;
            }
            if (this.stopButton) {
                this.stopButton.classList.add('hidden');
            }

            console.log('Preview stopped successfully');
        } catch (error) {
            console.error('Error stopping preview:', error);
        }
    }

    updatePreviewControls() {
        console.log('Updating preview controls');
        const effectType = this.effectSelect?.value;

        if (this.previewButton) {
            const shouldDisable = !effectType || this.isPreviewPlaying;
            this.previewButton.disabled = shouldDisable;
            console.log('Preview button state:', { disabled: shouldDisable });
        }

        // Show/hide effect-specific controls
        const controlSections = {
            'normalize': 'normalizeControls',
            'fadeInOut': 'fadeControls',
            'equalizer': 'equalizerControls',
            'reverb': 'reverbControls',
            'compression': 'compressionControls',
            'noise_reduction': 'noiseReductionControls',
            'pitch': 'pitchControls',
            'tempo': 'tempoControls'
        };

        // Hide all control sections first
        Object.values(controlSections).forEach(sectionId => {
            const section = document.getElementById(sectionId);
            if (section) {
                section.classList.add('hidden');
            }
        });

        // Show selected effect controls
        if (effectType && controlSections[effectType]) {
            const section = document.getElementById(controlSections[effectType]);
            if (section) {
                section.classList.remove('hidden');
            }
        }

        // Update section height if expanded
        const audioEffectsControls = document.getElementById('audioEffectsControls');
        if (audioEffectsControls && audioEffectsControls.style.maxHeight !== '0px') {
            const content = audioEffectsControls.querySelector('.audio-effects-content');
            if (content) {
                audioEffectsControls.style.maxHeight = `${content.scrollHeight}px`;
            }
        }
    }

    async createAudioEffect(effectType) {
        console.log('Creating audio effect:', effectType);
        try {
            switch (effectType) {
                case 'normalize':
                    return this.createNormalizeEffect();
                case 'fadeInOut':
                    return this.createFadeEffect();
                case 'equalizer':
                    return this.createEqualizerEffect();
                case 'reverb':
                    return this.createReverbEffect();
                case 'compression':
                    return this.createCompressionEffect();
                case 'noise_reduction':
                    return this.createNoiseReductionEffect();
                case 'pitch':
                    return this.createPitchEffect();
                case 'tempo':
                    return this.createTempoEffect();
                default:
                    throw new Error('Unknown effect type');
            }
        } catch (error) {
            console.error('Error creating audio effect:', error);
            throw error;
        }
    }

    // Effect creation methods...
    createNormalizeEffect() {
        const gainNode = this.audioContext.createGain();
        const level = parseFloat(document.getElementById('normalizeLevel')?.value || -14);
        gainNode.gain.value = Math.pow(10, level / 20);
        return gainNode;
    }

    createFadeEffect() {
        const gainNode = this.audioContext.createGain();
        const fadeInDuration = parseFloat(document.getElementById('fadeInDuration')?.value || 1);
        const fadeOutDuration = parseFloat(document.getElementById('fadeOutDuration')?.value || 1);

        const currentTime = this.audioContext.currentTime;
        gainNode.gain.setValueAtTime(0, currentTime);
        gainNode.gain.linearRampToValueAtTime(1, currentTime + fadeInDuration);
        gainNode.gain.linearRampToValueAtTime(0, currentTime + this.previewDuration);

        return gainNode;
    }

    createEqualizerEffect() {
        const lowShelf = this.audioContext.createBiquadFilter();
        const midPeak = this.audioContext.createBiquadFilter();
        const highShelf = this.audioContext.createBiquadFilter();

        lowShelf.type = 'lowshelf';
        lowShelf.frequency.value = 320;
        lowShelf.gain.value = parseFloat(document.getElementById('eqLow')?.value || 0);

        midPeak.type = 'peaking';
        midPeak.frequency.value = 1000;
        midPeak.Q.value = 0.5;
        midPeak.gain.value = parseFloat(document.getElementById('eqMid')?.value || 0);

        highShelf.type = 'highshelf';
        highShelf.frequency.value = 3200;
        highShelf.gain.value = parseFloat(document.getElementById('eqHigh')?.value || 0);

        lowShelf.connect(midPeak);
        midPeak.connect(highShelf);

        return lowShelf;
    }

    createReverbEffect() {
        const convolver = this.audioContext.createConvolver();
        const wetGain = this.audioContext.createGain();
        const dryGain = this.audioContext.createGain();

        const mix = parseFloat(document.getElementById('reverbMix')?.value || 30) / 100;
        wetGain.gain.value = mix;
        dryGain.gain.value = 1 - mix;

        // Simple impulse response for preview
        const sampleRate = this.audioContext.sampleRate;
        const length = sampleRate * 2; // 2 seconds
        const impulse = this.audioContext.createBuffer(2, length, sampleRate);

        for (let channel = 0; channel < impulse.numberOfChannels; channel++) {
            const channelData = impulse.getChannelData(channel);
            for (let i = 0; i < length; i++) {
                channelData[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2);
            }
        }

        convolver.buffer = impulse;
        return convolver;
    }

    createCompressionEffect() {
        const compressor = this.audioContext.createDynamicsCompressor();
        compressor.threshold.value = parseFloat(document.getElementById('compThreshold')?.value || -24);
        compressor.ratio.value = parseFloat(document.getElementById('compRatio')?.value || 2);
        return compressor;
    }

    createNoiseReductionEffect() {
        // Simple noise gate for preview
        const gainNode = this.audioContext.createGain();
        const strength = parseFloat(document.getElementById('nrStrength')?.value || 50) / 100;
        gainNode.gain.value = 1 - strength * 0.5;
        return gainNode;
    }

    createPitchEffect() {
        // Simple pitch shifter using playbackRate
        const pitchShift = parseFloat(document.getElementById('pitchShift')?.value || 0);
        this.videoPlayer.playbackRate = Math.pow(2, pitchShift / 12);
        return this.audioContext.createGain(); // Pass-through node
    }

    createTempoEffect() {
        // Simple tempo change using playbackRate
        const tempoFactor = parseFloat(document.getElementById('tempoFactor')?.value || 1.0);
        this.videoPlayer.playbackRate = tempoFactor;
        return this.audioContext.createGain(); // Pass-through node
    }
}

// Initialize audio preview when document is ready
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM Content Loaded - Looking for video player');
    initializeAudioPreview();

    // Also observe DOM changes to handle dynamic loading
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.addedNodes.length) {
                const videoPlayer = document.getElementById('videoPlayer');
                if (videoPlayer && !window.audioPreview) {
                    console.log('Video player found after DOM mutation');
                    initializeAudioPreview();
                }
            }
        });
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
});

function initializeAudioPreview() {
    const videoPlayer = document.getElementById('videoPlayer');
    if (videoPlayer) {
        try {
            console.log('Initializing AudioPreview with video player');
            window.audioPreview = new AudioPreview(videoPlayer);
        } catch (error) {
            console.error('Error initializing AudioPreview:', error);
        }
    } else {
        console.log('Video player element not found yet');
    }
} 