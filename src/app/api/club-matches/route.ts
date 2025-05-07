import { NextResponse, NextRequest } from 'next/server';
import pool from '@/lib/db';

export async function GET(request: NextRequest) {
  let client;
  try {
    // Parameter aus der URL extrahieren
    const searchParams = request.nextUrl.searchParams;
    const clubId = searchParams.get('clubId');

    // Überprüfen, ob die Vereins-ID vorhanden ist
    if (!clubId) {
      return NextResponse.json(
        { error: 'Vereins-ID ist erforderlich' },
        { status: 400 }
      );
    }

    // SQL-Query vorbereiten mit JOIN zu clubs_table
    const sqlQuery = `
      SELECT 
        m.season,
        m.matchday,
        m.match_date,
        m.match_id,
        m.home_club_id,
        h.club_shortname as home_club_shortname,
        m.home_score,
        m.away_club_id,
        a.club_shortname as away_club_shortname,
        m.away_score,
        m.home_probabilities,
        m.away_probabilities,
        m.draw_probabilities,
        m.home_heuristics,
        m.away_heuristics,
        m.draw_heuristics
      FROM 
        matches_table m
      LEFT JOIN 
        clubs_table h ON m.home_club_id = h.club_id
      LEFT JOIN 
        clubs_table a ON m.away_club_id = a.club_id
      WHERE 
        m.home_club_id = $1 OR m.away_club_id = $1
      ORDER BY 
        m.season DESC, m.matchday ASC
    `;

    client = await pool.connect();
    console.log(`API-Route /api/club-matches - Query ausführen mit Vereins-ID:`, clubId);

    const result = await client.query(sqlQuery, [clubId]);

    console.log(`${result.rowCount} Spieleinträge für Verein ${clubId} gefunden`);

    // Ergebnisse als JSON zurückgeben
    return NextResponse.json(result.rows);

  } catch (error) {
    console.error('API-Route /api/club-matches - Fehler beim Abrufen der Vereinsspiele:', error);
    return NextResponse.json(
      { error: 'Fehler beim Abrufen der Vereinsspiele' },
      { status: 500 }
    );
  } finally {
    // Wichtig: Client immer an den Pool zurückgeben
    if (client) {
      console.log('API-Route /api/club-matches - DB-Client freigeben');
      client.release();
    }
  }
} 