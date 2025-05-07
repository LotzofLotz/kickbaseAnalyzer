import { NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const clubId = searchParams.get('clubId');

  if (!clubId) {
    return NextResponse.json({ error: 'clubId ist erforderlich' }, { status: 400 });
  }

  try {
    const result = await sql`
      SELECT club_shortname 
      FROM player_table 
      WHERE club_id = ${clubId}
      LIMIT 1
    `;

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Kein Club gefunden' }, { status: 404 });
    }

    return NextResponse.json({ club_shortname: result.rows[0].club_shortname });
  } catch (error) {
    console.error('Fehler beim Abrufen des club_shortname:', error);
    return NextResponse.json({ error: 'Interner Serverfehler' }, { status: 500 });
  }
} 