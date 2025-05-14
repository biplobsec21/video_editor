function showReels(pageId) {
    console.log('Fetching reels for pageId:', pageId);
    fetch(`/video_collection/reels/${pageId}`)
        .then(response => response.json())
        .then(reels => {
            console.log('Received reels:', reels);
            const reelsContent = document.getElementById('reelsContent');
            const reelsModalTitle = document.getElementById('reelsModalTitle');
            reelsContent.innerHTML = '';

            // Update modal title with reel count
            reelsModalTitle.textContent = `Reels (${reels.length})`;

            if (reels.length === 0) {
                reelsContent.innerHTML = '<p class="text-gray-500">No reels found.</p>';
            } else {
                reels.forEach(reel => {
                    const reelDiv = document.createElement('div');
                    reelDiv.className = 'bg-gray-100 p-4 rounded-lg';
                    reelDiv.innerHTML = `
                        <a href="${reel.reelUrl}" target="_blank">
                            <img src="${reel.src || '/images/placeholder.jpg'}" alt="Reel Thumbnail" class="w-full h-48 object-cover rounded mb-2">
                        </a>
                        <p class="text-sm text-gray-700">Engagement: ${reel.targetSpanText || 'N/A'}</p>
                        <p class="text-sm text-gray-700">Source JSON: ${reel.jsonFile ? reel.jsonFile.split('/').pop() : 'Unknown'}</p>
                    `;
                    reelsContent.appendChild(reelDiv);
                });
            }

            document.getElementById('reelsModal').classList.remove('hidden');
        })
        .catch(error => {
            console.error('Error fetching reels:', error);
            alert('Error loading reels');
        });
}

function closeModal() {
    document.getElementById('reelsModal').classList.add('hidden');
}