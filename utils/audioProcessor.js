const ffmpeg = require('fluent-ffmpeg');
const path = require('path');

class AudioProcessor {
    constructor() {
        this.filters = [];
    }

    // Normalize audio levels
    normalize(level = -14) {
        this.filters.push(`loudnorm=I=${level}:TP=-1:LRA=11`);
        return this;
    }

    // Add reverb effect
    reverb(mix = 0.3, roomSize = 'medium') {
        const roomSizes = {
            small: { delays: '50|100', decays: '0.3|0.2' },
            medium: { delays: '100|200', decays: '0.4|0.3' },
            large: { delays: '200|400', decays: '0.6|0.4' },
            cathedral: { delays: '400|800', decays: '0.8|0.6' }
        };
        const room = roomSizes[roomSize] || roomSizes.medium;
        this.filters.push(`aecho=0.8:0.88:${room.delays}:${room.decays}`);
        this.filters.push(`volume=${1 + mix}`);
        return this;
    }

    // Apply equalization
    equalizer(low = 0, mid = 0, high = 0) {
        if (low !== 0) {
            this.filters.push(`equalizer=f=100:t=h:w=200:g=${low}`);
        }
        if (mid !== 0) {
            this.filters.push(`equalizer=f=1000:t=h:w=200:g=${mid}`);
        }
        if (high !== 0) {
            this.filters.push(`equalizer=f=10000:t=h:w=200:g=${high}`);
        }
        return this;
    }

    // Apply compression
    compress(threshold = -24, ratio = 2) {
        this.filters.push(`acompressor=threshold=${threshold}dB:ratio=${ratio}:attack=20:release=250`);
        return this;
    }

    // Reduce noise
    reduceNoise(strength = 0.5) {
        this.filters.push(`anlmdn=s=${strength}:p=0.95:r=0.5`);
        return this;
    }

    // Shift pitch
    pitchShift(semitones = 0) {
        if (semitones !== 0) {
            const pitch = Math.pow(2, semitones / 12);
            this.filters.push(`rubberband=pitch=${pitch}`);
        }
        return this;
    }

    // Adjust tempo
    adjustTempo(factor = 1.0) {
        if (factor !== 1.0) {
            this.filters.push(`rubberband=tempo=${factor}`);
        }
        return this;
    }

    // Add fade in/out
    fade(fadeIn = 0, fadeOut = 0) {
        if (fadeIn > 0) {
            this.filters.push(`afade=t=in:st=0:d=${fadeIn}`);
        }
        if (fadeOut > 0) {
            this.filters.push(`afade=t=out:st=${fadeOut}:d=${fadeOut}`);
        }
        return this;
    }

    // Process audio with all applied filters
    async process(inputPath, outputPath) {
        return new Promise((resolve, reject) => {
            const command = ffmpeg(inputPath)
                .audioFilters(this.filters)
                .on('end', () => {
                    console.log('Audio processing finished');
                    resolve();
                })
                .on('error', (err) => {
                    console.error('Audio processing error:', err);
                    reject(err);
                });

            // If outputPath is provided, save to file
            if (outputPath) {
                command.save(outputPath);
            }
        });
    }

    // Get the current filter chain
    getFilters() {
        return this.filters;
    }

    // Clear all filters
    clearFilters() {
        this.filters = [];
        return this;
    }
}

module.exports = AudioProcessor; 