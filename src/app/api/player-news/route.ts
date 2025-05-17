import { NextResponse } from 'next/server';
import pool from '@/lib/db';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const playerId = searchParams.get('playerId');

    if (!playerId) {
        return NextResponse.json({ error: 'Spieler-ID ist erforderlich' }, { status: 400 });
    }

    let client;
    try {
        client = await pool.connect();
        const result = await client.query(
            `SELECT 
                player_id,
                date,
                time,
                title,
                link,
                comprehension,
                category
            FROM news_table
            WHERE player_id = $1
            ORDER BY date DESC, time DESC`,
            [playerId]
        );
        return NextResponse.json(result.rows);
    } catch (error) {
        console.error('Datenbankfehler:', error);
        return NextResponse.json({ error: String(error) }, { status: 500 });
    } finally {
        if (client) client.release();
    }
} 