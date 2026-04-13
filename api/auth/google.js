import { MongoClient } from 'mongodb';
import { OAuth2Client } from 'google-auth-library';

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).end();

    const { token, role } = req.body;
    const mongoClient = new MongoClient(process.env.MONGO_URI);

    try {
        const ticket = await client.verifyIdToken({
            idToken: token,
            audience: process.env.GOOGLE_CLIENT_ID,
        });
        const payload = ticket.getPayload();
        
        await mongoClient.connect();
        const user = await mongoClient.db('taxichat').collection('users').findOne({ 
            email: payload.email, 
            role: role 
        });

        if (user) {
            res.status(200).json({ success: true, user });
        } else {
            res.status(401).json({ success: false, message: "No autorizado" });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    } finally {
        await mongoClient.close();
    }
}