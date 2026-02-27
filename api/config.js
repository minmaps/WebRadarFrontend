module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Credentials', true)
    res.setHeader('Access-Control-Allow-Origin', '*')

    if (req.method === 'OPTIONS') {
        res.status(200).end()
        return
    }

    // Expose ONLY public keys
    res.status(200).json({
        pusherKey: process.env.NEXT_PUBLIC_PUSHER_KEY,
        pusherCluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER
    });
};
