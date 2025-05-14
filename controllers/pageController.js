const axios = require('axios');
const Page = require('../models/pageModel');

// List all pages
exports.listPages = (req, res) => {
    Page.getAll((err, rows) => {
        if (err) return res.status(500).send('Error fetching pages');
        res.render('pages/fb_page/index', { pages: rows });
    });
};

// Sync pages from Facebook Graph API
exports.syncPages = async (req, res) => {
    console.log('gerer');
    try {
        const token = process.env.FB_USER_TOKEN;

        console.log("🔄 Syncing Facebook pages...");

        const result = await axios.get(`https://graph.facebook.com/me/accounts?fields=pages_show_list,pages_read_engagement,pages_manage_posts,id,name,link,picture.width(150).height(150),access_token&access_token=${token}`);

        console.log("✅ Facebook API Response:");
        console.log(JSON.stringify(result.data, null, 2)); // Pretty print the response

        const pages = result.data.data.map(page => ({
            pageid: page.id,
            name: page.name,
            page_image: page.picture?.data?.url || '', // Profile image URL
            accessToken: page.access_token,   // Access token for the page
            page_url: page.link || `https://www.facebook.com/${page.id}`
        }));


        if (!pages || pages.length === 0) {
            console.warn("⚠️ No pages returned from Facebook.");
            return res.status(200).send('No pages found from Facebook.');
        }

        // Save all pages to the database
        Page.saveAll(pages, () => {
            console.log(`✅ Saved ${pages.length} pages to database.`);
            res.redirect('/');
        });

    } catch (err) {
        console.error("❌ Error syncing Facebook pages:", err.response?.data || err.message);
        res.status(500).send('Error syncing Facebook pages');
    }
};


// Delete a page
exports.deletePage = (req, res) => {
    const { id } = req.params;
    Page.delete(id, (err) => {
        if (err) return res.status(500).send('Error deleting page');
        res.sendStatus(200);
    });
};

// Update a page
exports.updatePage = (req, res) => {
    const { id } = req.params;
    const { name } = req.body;

    Page.update(id, name, (err) => {
        if (err) return res.status(500).send('Error updating page');
        res.sendStatus(200);
    });
};
