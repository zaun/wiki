export async function fetchTitle(req, res) {
    const url = req.query.url
    if (!url) {
        return res
            .status(400)
            .json({ error: 'Missing required `url` query parameter' })
    }

    try {
        const response = await fetch(url)
        if (!response.ok) {
            return res
                .status(response.status)
                .json({ error: `Failed to fetch URL: ${response.statusText}`, details: response.text() })
        }

        const html = await response.text()
        const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
        const title = match ? match[1].trim() : ''

        return res.json({ title })
    } catch (err) {
        console.error('fetchTitle error:', err)
        return res
            .status(500)
            .json({ error: 'Error fetching title', details: err.message })
    }
}
