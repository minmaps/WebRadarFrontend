const Pusher = require("pusher");

const pusher = new Pusher({
    appId: process.env.PUSHER_APP_ID,
    key: process.env.NEXT_PUBLIC_PUSHER_KEY,
    secret: process.env.PUSHER_SECRET,
    cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER,
    useTLS: true
});

module.exports = async (req, res) => {
    // CORS Headers for testing (if calling from a browser, but here it's from C++)
    res.setHeader('Access-Control-Allow-Credentials', true)
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT')

    if (req.method === 'OPTIONS') {
        res.status(200).end()
        return
    }

    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed. Use POST." });
    }

    const { room } = req.query;

    if (!room) {
        return res.status(400).json({ error: "Missing 'room' query parameter." });
    }

    try {
        const data = req.body;

        // Validate payload
        if (!data || !data.peds) {
            return res.status(400).json({ error: "Invalid payload format. Expected { peds: [...] }" });
        }

        // Broadcast the update to the specific room channel
        await pusher.trigger(`webradar-${room}`, "update_map", data);

        return res.status(200).json({ success: true, message: "Data synchronized." });
    } catch (error) {
        console.error("Pusher error:", error);
        return res.status(500).json({ error: "Internal server error." });
    }
};
