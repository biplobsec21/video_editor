// pageModel.js
const db = require('../database/db'); // Import the db connection

// Save multiple pages into the database
const saveAll = (pages, callback) => {
    const stmt = db.prepare('INSERT OR REPLACE INTO pages (pageid, name, page_image, accessToken, page_url) VALUES (?, ?, ?, ?, ?)');

    pages.forEach(page => {
        const { pageid, name, page_image, accessToken, page_url } = page;
        stmt.run(pageid, name, page_image, accessToken, page_url, (err) => {
            if (err) {
                console.error('Error inserting page:', err);
            }
        });
    });

    stmt.finalize(() => {
        callback(); // Call the callback after all pages have been processed
    });
};

// Retrieve all pages from the database
const getAll = (callback) => {
    db.all('SELECT * FROM pages', [], (err, rows) => {
        if (err) {
            console.error('Error retrieving pages:', err);
            return callback(err);
        }
        callback(null, rows); // Return the rows (pages) to the callback
    });
};

// Delete a page by its ID
const deletePage = (id, callback) => {
    db.run('DELETE FROM pages WHERE id = ?', [id], function (err) {
        if (err) {
            console.error('Error deleting page:', err);
            return callback(err);
        }
        callback(); // Return control to the callback after deletion
    });
};

// Update a page by its ID
const update = (id, name, callback) => {
    db.run('UPDATE pages SET name = ? WHERE id = ?', [name, id], function (err) {
        if (err) {
            console.error('Error updating page:', err);
            return callback(err);
        }
        callback(); // Return control to the callback after updating
    });
};

module.exports = {
    saveAll,
    getAll,
    deletePage, // Renamed the delete method to deletePage
    update
};
