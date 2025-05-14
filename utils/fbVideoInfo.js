const axios = require('axios');

/**
 * Fetches video information from a Facebook video URL.
 * @param {string} videoUrl - The Facebook video URL (e.g., https://www.facebook.com/reel/4041918069468901).
 * @param {string} [cookie] - Optional cookie string for authenticated requests.
 * @param {string} [useragent] - Optional user-agent string.
 * @returns {Promise<{url: string, duration_ms: number, sd: string, hd: string, title: string, thumbnail: string}>}
 *          A promise that resolves with video info or rejects with an error.
 */
const getFbVideoInfo = async (videoUrl, cookie, useragent) => {
    // Default headers for Facebook requests
    const headers = {
        'sec-fetch-user': '?1',
        'sec-ch-ua-mobile': '?0',
        'sec-fetch-site': 'none',
        'sec-fetch-dest': 'document',
        'sec-fetch-mode': 'navigate',
        'cache-control': 'max-age=0',
        authority: 'www.facebook.com',
        'upgrade-insecure-requests': '1',
        'accept-language': 'en-GB,en;q=0.9,tr-TR;q=0.8,tr;q=0.7,en-US;q=0.6',
        'sec-ch-ua': '"Google Chrome";v="89", "Chromium";v="89", ";Not A Brand";v="99"',
        'user-agent': useragent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/89.0.4389.114 Safari/537.36',
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9',
        cookie: cookie || 'sb=Rn8BYQvCEb2fpMQZjsd6L382; datr=Rn8BYbyhXgw9RlOvmsosmVNT; c_user=100003164630629; _fbp=fb.1.1629876126997.444699739; wd=1920x939; spin=r.1004812505_b.trunk_t.1638730393_s.1_v.2_; xs=28%3A8ROnP0aeVF8XcQ%3A2%3A1627488145%3A-1%3A4916%3A%3AAcWIuSjPy2mlTPuZAeA2wWzHzEDuumXI89jH8a_QIV8; fr=0jQw7hcrFdas2ZeyT.AWVpRNl_4noCEs_hb8kaZahs-jA.BhrQqa.3E.AAA.0.0.BhrQqa.AWUu879ZtCw'
    };

    // Helper to parse escaped strings
    const parseString = (string) => {
        try {
            return JSON.parse(`{"text": "${string.replace(/"/g, '\\"')}"}`).text;
        } catch (e) {
            return string;
        }
    };

    // Input validation
    if (!videoUrl || !videoUrl.trim()) {
        throw new Error('Please specify the Facebook URL');
    }
    if (!['facebook.com', 'fb.watch'].some(domain => videoUrl.includes(domain))) {
        throw new Error('Please enter a valid Facebook URL');
    }

    try {
        // Fetch the video page
        const { data } = await axios.get(videoUrl, { headers });

        // Clean and normalize the response data
        const cleanedData = data.replace(/"/g, '"').replace(/&/g, '&');

        // Extract video URLs
        const sdMatch = (
            cleanedData.match(/"browser_native_sd_url":"(.*?)"/) ||
            cleanedData.match(/"playable_url":"(.*?)"/) ||
            cleanedData.match(/sd_src\s*:\s*"([^"]*)"/) ||
            cleanedData.match(/(?<="src":")[^"]*(https:\/\/[^"]*)/)
        );
        const hdMatch = (
            cleanedData.match(/"browser_native_hd_url":"(.*?)"/) ||
            cleanedData.match(/"playable_url_quality_hd":"(.*?)"/) ||
            cleanedData.match(/hd_src\s*:\s*"([^"]*)"/)
        );

        // Extract metadata
        const titleMatch = cleanedData.match(/<meta\sname="description"\scontent="(.*?)"/) || cleanedData.match(/<title>(.*?)<\/title>/);
        const thumbMatch = cleanedData.match(/"preferred_thumbnail":{"image":{"uri":"(.*?)"/);
        const durationMatch = cleanedData.match(/"playable_duration_in_ms":(\d+)/);

        if (sdMatch && sdMatch[1]) {
            return {
                url: videoUrl,
                duration_ms: durationMatch ? Number(durationMatch[1]) : 0,
                sd: parseString(sdMatch[1]),
                hd: hdMatch && hdMatch[1] ? parseString(hdMatch[1]) : '',
                title: titleMatch && titleMatch[1] ? parseString(titleMatch[1]) : '',
                thumbnail: thumbMatch && thumbMatch[1] ? parseString(thumbMatch[1]) : ''
            };
        } else {
            throw new Error('Unable to fetch video information at this time');
        }
    } catch (err) {
        console.error(`Error fetching video info for ${videoUrl}:`, err.message);
        throw new Error('Unable to fetch video information at this time. Please try again');
    }
};

module.exports = getFbVideoInfo;