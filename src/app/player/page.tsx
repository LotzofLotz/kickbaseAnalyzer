'use client';

import { Suspense, useState, useEffect, useMemo } from 'react'; // Import useMemo
import { useRouter, useSearchParams } from 'next/navigation';
import { formatCurrency } from '@/lib/kickbase-api';
import { getPositionName, getStatusName, getTeamData } from '@/utils/player.utils';
// Entferne Recharts-Importe, da wir sie hierfür nicht mehr nutzen
// import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const CDN_BASE_URL = 'https://kickbase.b-cdn.net/';

// Interfaces bleiben gleich...
interface ValueHistory {
    player_id: string;
    date: string;
    value: number;
}

interface PlayerStats {
    season: string;
    matchday: number;
    player_id: string;
    points: number;
    minutes: number;
    started: boolean;
    red: number;
    yellow: number;
    goals: number;
    assist: number;
    status: number;
    liga_note: number | null;
    injury_text: string | null;
    forecast: number | null;
}

interface ClubMatch {
    season: string;
    matchday: number;
    match_date: string;
    match_id: string;
    home_club_id: string;
    home_club_shortname: string;
    home_score: number;
    away_club_id: string;
    away_club_shortname: string;
    away_score: number;
    home_probabilities: number;
    away_probabilities: number;
    draw_probabilities: number;
}

// Kombinierte Datenstruktur für die Visualisierung
interface MatchdayVizData {
    matchday: number;
    points: number | null;
    marketValue: number | null;
    marketValueFormatted: string | null;
}

const getQueryParam = (params: URLSearchParams | null, key: string, defaultValue: string = '-') => {
    return params?.get(key) ? decodeURIComponent(params.get(key)!) : defaultValue;
};

// Hilfsfunktion zur Berechnung der Balkenhöhe (oder Punktposition)
// Skaliert den Wert auf einen Bereich von 0-100 (Prozent der maximalen Höhe)
// Behandelt null, 0 und negative Werte
const calculateVizHeight = (value: number | null, maxValue: number, minValue: number = 0): number => {
    if (value === null || value === undefined) return 0;

    // Fall für nur positive Werte (z.B. Marktwert)
    if (minValue >= 0) {
        if (maxValue <= 0) return 0; // Keine positiven Werte vorhanden
        return Math.max(0, Math.min(100, (value / maxValue) * 100));
    }

    // Fall für Werte, die positiv oder negativ sein können (z.B. Punkte)
    const range = maxValue - minValue;
    if (range <= 0) {
        // Wenn alle Werte gleich sind (oder nur ein Wert existiert)
        if (value > 0) return 50; // Zeige etwas Positives
        if (value < 0) return 50; // Zeige etwas Negatives (ggf. andere Darstellung nötig)
        return 0; // Wenn Wert 0 ist
    }
    // Skalieren auf 0-100, wobei 0 dem minValue entspricht
    const scaledValue = ((value - minValue) / range) * 100;
    return Math.max(0, Math.min(100, scaledValue));
};

// Hilfsfunktion, um den Marktwert für einen Spieltag zu finden
const findMarketValueForMatchday = (matchday: number, clubMatches: ClubMatch[], valueHistory: ValueHistory[]): number | null => {
    const matchingMatch = clubMatches.find(match => match.matchday === matchday);
    if (!matchingMatch || !matchingMatch.match_date) return null;

    const matchDate = new Date(matchingMatch.match_date);
    let closestValueEntry: ValueHistory | null = null;
    let minDaysDiff = Infinity;

    valueHistory.forEach(entry => {
        const entryDate = new Date(entry.date);
        // Differenz in Tagen berechnen
        const timeDiff = entryDate.getTime() - matchDate.getTime();
        const daysDiff = timeDiff / (1000 * 60 * 60 * 24); // Kann negativ sein (vor dem Spieltag)

        // Wir suchen den Wert am Spieltag oder den letzten davor (max 7 Tage zurück)
        if (entryDate <= matchDate) {
            const absDaysDiff = Math.abs(daysDiff);
            if (absDaysDiff < minDaysDiff) {
                minDaysDiff = absDaysDiff;
                closestValueEntry = entry;
            }
        }
        // Wenn es keinen Wert <= matchDate gibt, nimm den nächsten danach (max 3 Tage)
        // um Fälle abzudecken, wo der MW erst nach dem Spieltag aktualisiert wird
        else if (closestValueEntry === null && daysDiff <= 3 && daysDiff < minDaysDiff) {
             minDaysDiff = daysDiff;
             closestValueEntry = entry;
        }
    });

    // Fallback: Wenn kein Wert gefunden wurde (oder zu weit weg), nimm den allerletzten bekannten Wert, wenn er nicht zu alt ist
     if (!closestValueEntry && valueHistory.length > 0) {
        const lastEntry = valueHistory[valueHistory.length - 1];
        const lastEntryDate = new Date(lastEntry.date);
        const diffToNow = Math.abs(matchDate.getTime() - lastEntryDate.getTime()) / (1000 * 60 * 60 * 24);
         if (diffToNow < 30) { // Nur wenn der letzte Wert nicht älter als ~1 Monat ist
            //return lastEntry.value; // Optionale Fallback-Logik
         }
     }

    return closestValueEntry ? closestValueEntry.value : null;
};


function PlayerInfoContent() {
    const router = useRouter();
    const searchParams = useSearchParams();

    // Player data extraction remains the same...
    const playerId = getQueryParam(searchParams, 'id');
    const firstName = getQueryParam(searchParams, 'firstName');
    const lastName = getQueryParam(searchParams, 'lastName', 'Spieler');
    const teamId = getQueryParam(searchParams, 'teamId');
    const leagueId = getQueryParam(searchParams, 'leagueId', '');
    const position = parseInt(getQueryParam(searchParams, 'position', '0'));
    const status = parseInt(getQueryParam(searchParams, 'status', '0'));
    const marketValue = parseInt(getQueryParam(searchParams, 'marketValue', '0'));
    const points = getQueryParam(searchParams, 'points');
    const avgPoints = getQueryParam(searchParams, 'avgPoints');
    const playerImage = getQueryParam(searchParams, 'playerImage');
    const mvt = parseInt(getQueryParam(searchParams, 'mvt', '-1'));

    const [leagueImage, setLeagueImage] = useState<string | null>(null);
    const [valueHistory, setValueHistory] = useState<ValueHistory[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [playerStats, setPlayerStats] = useState<PlayerStats[]>([]);
    const [statsLoading, setStatsLoading] = useState(false);
    const [statsError, setStatsError] = useState<string | null>(null);

    const [clubMatches, setClubMatches] = useState<ClubMatch[]>([]);
    const [matchesLoading, setMatchesLoading] = useState(false);
    const [matchesError, setMatchesError] = useState<string | null>(null);

    // --- Fetching useEffect hooks remain the same ---
    // Get league image
    useEffect(() => {
        // ... (no changes needed here)
        if (leagueId) {
            const storedLeague = localStorage.getItem('selectedLeague');
            if (storedLeague) {
                try {
                    const selectedLeague = JSON.parse(storedLeague);
                    if (selectedLeague.id === leagueId) {
                        setLeagueImage(selectedLeague.image);
                    }
                } catch (e) {
                    console.error("Error parsing selectedLeague for header:", e);
                }
            }
        }
    }, [leagueId]);

    // Fetch player value history
    useEffect(() => {
        // ... (no changes needed here)
         const fetchValueHistory = async () => {
            if (!playerId || playerId === '-') return;
            setIsLoading(true);
            setError(null);
            try {
                const apiUrl = `/api/player-values?playerId=${encodeURIComponent(playerId)}`;
                const response = await fetch(apiUrl);
                if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
                const data: ValueHistory[] = await response.json();
                 // Sortiere die Werthistorie nach Datum aufsteigend, wichtig für die Logik
                setValueHistory(data.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()));
            } catch (e) {
                setError(e instanceof Error ? e.message : 'Failed to load player values.');
            } finally {
                setIsLoading(false);
            }
        };
        fetchValueHistory();
    }, [playerId]);

    // Fetch player stats
    useEffect(() => {
        // ... (no changes needed here)
         const fetchPlayerStats = async () => {
             if (!playerId || playerId === '-') return;
             setStatsLoading(true);
             setStatsError(null);
             try {
                 const apiUrl = `/api/player-stats?playerId=${encodeURIComponent(playerId)}`;
                 const response = await fetch(apiUrl);
                 if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
                 const data: PlayerStats[] = await response.json();
                 setPlayerStats(data.sort((a, b) => a.matchday - b.matchday)); // Sortiere nach Spieltag
             } catch (e) {
                 setStatsError(e instanceof Error ? e.message : 'Failed to load player statistics.');
             } finally {
                 setStatsLoading(false);
             }
         };
        fetchPlayerStats();
    }, [playerId]);

    // Fetch club matches
    useEffect(() => {
        // ... (no changes needed here)
         const fetchClubMatches = async () => {
             if (!teamId || teamId === '-') return;
             setMatchesLoading(true);
             setMatchesError(null);
             try {
                 const apiUrl = `/api/club-matches?clubId=${encodeURIComponent(teamId)}`;
                 const response = await fetch(apiUrl);
                 if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
                 const data: ClubMatch[] = await response.json();
                 setClubMatches(data.sort((a, b) => a.matchday - b.matchday)); // Sortiere nach Spieltag
             } catch (e) {
                 setMatchesError(e instanceof Error ? e.message : 'Failed to load club matches.');
             } finally {
                 setMatchesLoading(false);
             }
         };
        fetchClubMatches();
    }, [teamId]);
    // -----------------------------------------------

    // Combine data for visualization using useMemo for performance
    const combinedMatchdayData = useMemo((): MatchdayVizData[] => {
        const combined: MatchdayVizData[] = [];
        const statsMap = new Map(playerStats.map(stat => [stat.matchday, stat]));
        const matchMap = new Map(clubMatches.map(match => [match.matchday, match]));

        for (let i = 1; i <= 34; i++) {
            const stat = statsMap.get(i);
            const points = stat?.points ?? null;
            const marketValue = findMarketValueForMatchday(i, clubMatches, valueHistory);
            const marketValueFormatted = marketValue !== null ? formatCurrency(marketValue) : null;

            combined.push({
                matchday: i,
                points: points,
                marketValue: marketValue,
                marketValueFormatted: marketValueFormatted
            });
        }
        return combined;
    }, [playerStats, clubMatches, valueHistory]);

    // Calculate max/min values for scaling the visualization
    const { maxPoints, minPoints, maxMarketValue } = useMemo(() => {
        const pointsValues = combinedMatchdayData.map(d => d.points).filter((p): p is number => p !== null);
        const marketValues = combinedMatchdayData.map(d => d.marketValue).filter((mv): mv is number => mv !== null);

        return {
            maxPoints: pointsValues.length > 0 ? Math.max(0, ...pointsValues) : 0, // Max nicht unter 0
            minPoints: pointsValues.length > 0 ? Math.min(0, ...pointsValues) : 0, // Min nicht über 0
            maxMarketValue: marketValues.length > 0 ? Math.max(...marketValues) : 0,
        };
    }, [combinedMatchdayData]);


    const teamData = getTeamData(teamId ?? '');
    const imageUrl = playerImage && playerImage !== '-'
                     ? (playerImage.startsWith('http') || playerImage.startsWith('/') ? playerImage : `${CDN_BASE_URL}${playerImage}`)
                     : '/placeholder.png';

    let trendIcon = '→';
    let trendColor = 'text-gray-500 dark:text-gray-400';
    if (mvt === 1) { trendIcon = '↑'; trendColor = 'text-green-600 dark:text-green-400'; }
    else if (mvt === 2) { trendIcon = '↓'; trendColor = 'text-red-600 dark:text-red-400'; }

    const handleBack = () => router.back();

    // Check if data is ready for the table/visualization
    const isDataReady = !statsLoading && !matchesLoading && !isLoading && !statsError && !matchesError;

    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-900 dark:to-gray-800">
            {/* Header bleibt gleich */}
             <header className="bg-white dark:bg-gray-850 shadow">
                <div className="max-w-7xl mx-auto py-4 px-4 sm:px-6 lg:px-8 flex justify-between items-center">
                     <div className="flex items-center space-x-3">
                         {leagueId && leagueImage && (
                              <button onClick={() => router.push(`/dashboard?league=${leagueId}`)} title="Zum Liga-Dashboard">
                                 <img
                                     src={leagueImage}
                                     alt="Liga Logo"
                                     className="h-10 w-10 rounded-md object-cover hover:opacity-80 transition-opacity"
                                     onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                                 />
                              </button>
                         )}
                         <h1 className="text-xl font-bold text-gray-900 dark:text-white truncate">
                             {firstName !== '-' ? `${firstName} ${lastName}` : lastName}
                         </h1>
                     </div>
                     <button onClick={handleBack} className="text-sm font-medium text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">
                         Zurück
                     </button>
                 </div>
             </header>

            {/* Main Content */}
            <main className="max-w-full mx-auto py-6 px-2 sm:px-4 lg:px-6"> {/* Use max-w-full for wide table */}
                {/* Player Info Box bleibt gleich */}
                <div className="max-w-4xl mx-auto bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden mb-6">
                     {/* ... (Inhalt der Spielerinfo-Box unverändert) ... */}
                     <div className="p-6 flex flex-col md:flex-row items-center space-y-4 md:space-y-0 md:space-x-6">
                        <img
                            src={imageUrl}
                            alt={`${lastName}`}
                            className="h-32 w-32 rounded-full object-cover border-4 border-gray-200 dark:border-gray-700 shadow-md"
                            onError={(e) => { (e.currentTarget as HTMLImageElement).src = '/placeholder.png'; }}
                        />
                        <div className="flex-grow text-center md:text-left">
                            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">
                                {firstName !== '-' ? `${firstName} ${lastName}` : lastName}
                            </h2>
                            <div className="flex items-center justify-center md:justify-start space-x-2 mb-2">
                                {teamData.logo && <img src={`${CDN_BASE_URL}${teamData.logo}`} alt={teamData.name} className="h-6 w-6 object-contain"/>}
                                <span className="text-md text-gray-600 dark:text-gray-400">{teamData.name}</span>
                            </div>
                            <span className={`px-2.5 py-0.5 inline-flex text-sm leading-5 font-semibold rounded-full ${status === 1 ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200' : status === 0 ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'}`}>
                                {getStatusName(status)}
                             </span>
                        </div>
                    </div>
                    <div className="border-t border-gray-200 dark:border-gray-700 px-6 py-5 grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-6">
                        <div>
                            <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Position</dt>
                            <dd className="mt-1 text-lg font-semibold text-gray-900 dark:text-white">{getPositionName(position)}</dd>
                        </div>
                        <div>
                            <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Marktwert</dt>
                            <dd className="mt-1 text-lg font-semibold text-gray-900 dark:text-white flex items-center">
                                {formatCurrency(marketValue)}
                                {mvt !== -1 && (
                                    <span className={`ml-2 text-xl font-bold ${trendColor}`}>{trendIcon}</span>
                                )}
                            </dd>
                        </div>
                         <div>
                            <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Punkte</dt>
                            <dd className="mt-1 text-lg font-semibold text-gray-900 dark:text-white">{points}</dd>
                        </div>
                        <div>
                            <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Ø Punkte</dt>
                            <dd className="mt-1 text-lg font-semibold text-gray-900 dark:text-white">{avgPoints}</dd>
                        </div>
                        <div>
                            <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Spieler-ID</dt>
                            <dd className="mt-1 text-lg font-semibold text-gray-900 dark:text-white">{playerId}</dd>
                        </div>
                        <div>
                            <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Verein-ID</dt>
                            <dd className="mt-1 text-lg font-semibold text-gray-900 dark:text-white">{teamId}</dd>
                        </div>
                    </div>
                 </div>

                {/* Player Stats & Visualization Section */}
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
                    <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                        <h3 className="text-lg font-medium text-gray-900 dark:text-white">Spieler- und Vereinsdaten</h3>
                    </div>

                    <div className="overflow-x-auto"> {/* Wichtig für die breite Tabelle */}
                         <div className="min-w-max"> {/* Sorgt dafür, dass der Inhalt nicht umbricht */}
                            {statsLoading || matchesLoading || isLoading ? (
                                <p className="text-gray-600 dark:text-gray-400 text-center py-4 px-6">Lade Daten...</p>
                            ) : statsError || matchesError ? (
                                <div className="m-4 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative dark:bg-red-900/30 dark:border-red-600 dark:text-red-300">
                                    <strong className="font-bold">Fehler!</strong>
                                    <span className="block sm:inline"> {statsError || matchesError || error}</span>
                                </div>
                            ) : combinedMatchdayData.length === 0 && playerStats.length === 0 && clubMatches.length === 0 ? (
                                <p className="text-gray-600 dark:text-gray-400 text-center py-4 px-6">Keine Daten verfügbar.</p>
                            ) : (
                                <table className="divide-y divide-gray-200 dark:divide-gray-700 w-full">
                                    <thead className="bg-gray-50 dark:bg-gray-700">
                                        {/* MD Header */}
                                        <tr>
                                            <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider w-24 sticky left-0 bg-gray-50 dark:bg-gray-700 z-20">
                                                MD:
                                            </th>
                                            {Array.from({ length: 34 }, (_, i) => i + 1).map((matchday) => (
                                                <th key={matchday} scope="col" className="px-3 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider w-16">
                                                    {matchday}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                                        {/* Datum */}
                                        <tr className="bg-gray-50 dark:bg-gray-700/50">
                                            <td className="px-3 py-2 text-left text-xs font-medium text-gray-600 dark:text-gray-300 sticky left-0 bg-gray-50 dark:bg-gray-700/50 z-10 w-24">Datum:</td>
                                            {Array.from({ length: 34 }, (_, i) => i + 1).map((matchday) => {
                                                const matchingMatch = clubMatches.find(match => match.matchday === matchday);
                                                const formattedDate = matchingMatch?.match_date ? new Date(matchingMatch.match_date).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }) : '-';
                                                return (<td key={matchday} className="px-3 py-2 text-center text-xs text-gray-500 dark:text-gray-400 w-16">{formattedDate}</td>);
                                            })}
                                        </tr>

                                        {/* W/D/L */}
                                        <tr>
                                            <td className="px-3 py-2 text-left text-xs font-medium text-gray-600 dark:text-gray-300 sticky left-0 bg-white dark:bg-gray-800 z-10 w-24">W/D/L:</td>
                                            {Array.from({ length: 34 }, (_, i) => i + 1).map((matchday) => {
                                                const matchingMatch = clubMatches.find(match => match.matchday === matchday);
                                                if (!matchingMatch) return <td key={matchday} className="px-3 py-2 text-center text-xs text-gray-500 dark:text-gray-400 w-16">-</td>;
                                                const isHome = String(teamId) === String(matchingMatch.home_club_id);
                                                let result = 'D'; const hs = matchingMatch.home_score; const as = matchingMatch.away_score; if (hs > as) { result = isHome ? 'W' : 'L'; } else if (hs < as) { result = isHome ? 'L' : 'W'; }
                                                let rc = "text-yellow-500 dark:text-yellow-400 font-medium"; if (result === 'W') { rc = "text-green-600 dark:text-green-400 font-bold"; } else if (result === 'L') { rc = "text-red-600 dark:text-red-400 font-medium"; }
                                                return <td key={matchday} className={`px-3 py-2 text-center text-xs ${rc} w-16`}>{result}</td>;
                                            })}
                                        </tr>

                                        {/* Gegner */}
                                        <tr className="bg-gray-50 dark:bg-gray-700/50">
                                            <td className="px-3 py-2 text-left text-xs font-medium text-gray-600 dark:text-gray-300 sticky left-0 bg-gray-50 dark:bg-gray-700/50 z-10 w-24">Gegner:</td>
                                            {Array.from({ length: 34 }, (_, i) => i + 1).map((matchday) => {
                                                const matchingMatch = clubMatches.find(match => match.matchday === matchday);
                                                if (!matchingMatch) return <td key={matchday} className="px-3 py-2 text-center text-xs text-gray-500 dark:text-gray-400 w-16">-</td>;
                                                const isHome = String(teamId) === String(matchingMatch.home_club_id);
                                                const opponentShortname = isHome ? matchingMatch.away_club_shortname : matchingMatch.home_club_shortname;
                                                return (<td key={matchday} className="px-3 py-2 text-center text-xs text-gray-500 dark:text-gray-400 w-16">{opponentShortname || '-'}</td>);
                                            })}
                                        </tr>

                                        {/* Ergebnis */}
                                        <tr>
                                            <td className="px-3 py-2 text-left text-xs font-medium text-gray-600 dark:text-gray-300 sticky left-0 bg-white dark:bg-gray-800 z-10 w-24">Ergebnis:</td>
                                            {Array.from({ length: 34 }, (_, i) => i + 1).map((matchday) => {
                                                const matchingMatch = clubMatches.find(match => match.matchday === matchday);
                                                return (<td key={matchday} className="px-3 py-2 text-center text-xs text-gray-500 dark:text-gray-400 w-16">{matchingMatch ? `${matchingMatch.home_score}:${matchingMatch.away_score}` : '-'}</td>);
                                            })}
                                        </tr>

                                        {/* Place */}
                                        <tr className="bg-gray-50 dark:bg-gray-700/50">
                                            <td className="px-3 py-2 text-left text-xs font-medium text-gray-600 dark:text-gray-300 sticky left-0 bg-gray-50 dark:bg-gray-700/50 z-10 w-24">Place:</td>
                                            {Array.from({ length: 34 }, (_, i) => i + 1).map((matchday) => {
                                                const matchingMatch = clubMatches.find(match => match.matchday === matchday);
                                                const isHome = matchingMatch ? String(teamId) === String(matchingMatch.home_club_id) : null;
                                                return (<td key={matchday} className="px-3 py-2 text-center text-xs text-gray-500 dark:text-gray-400 w-16">{matchingMatch ? (isHome ? 'H' : 'A') : '-'}</td>);
                                            })}
                                        </tr>

                                        {/* Grafik */}
                                        <tr className="bg-gray-100 dark:bg-gray-750 border-b border-gray-300 dark:border-gray-600">
                                            <td className="px-3 py-2 text-left text-xs font-semibold text-gray-700 dark:text-gray-200 sticky left-0 bg-gray-100 dark:bg-gray-750 z-20 align-top w-24">
                                                Grafik:
                                            </td>
                                            {combinedMatchdayData.map(({ matchday, points, marketValue }) => {
                                                const pointsHeight = calculateVizHeight(points, maxPoints, minPoints);
                                                const mvHeight = calculateVizHeight(marketValue, maxMarketValue, 0);
                                                const range = maxPoints - minPoints;
                                                const zeroLinePercent = range > 0 ? Math.max(0, Math.min(100, (0 - minPoints) / range * 100)) : 50;
                                                const isNegativePoints = points !== null && points < 0;

                                                return (
                                                    <td key={`viz-${matchday}`} className="px-1 py-2 text-center align-bottom h-80 relative border-r border-gray-200 dark:border-gray-700 w-16">
                                                        <div className="w-full h-full flex justify-center items-end space-x-px">
                                                            {marketValue !== null && (
                                                                <div
                                                                    className="bg-green-500 hover:bg-green-400 w-2"
                                                                    style={{ height: `${mvHeight}%` }}
                                                                    title={`MW: ${formatCurrency(marketValue ?? 0)}`}
                                                                ></div>
                                                            )}
                                                            {points !== null && (
                                                                <div
                                                                    className={`${isNegativePoints ? 'bg-red-500 hover:bg-red-400' : 'bg-blue-500 hover:bg-blue-400'} w-2`}
                                                                    style={{
                                                                        height: `${calculateVizHeight(Math.abs(points ?? 0), Math.max(Math.abs(maxPoints), Math.abs(minPoints)))}%`,
                                                                    }}
                                                                    title={`Punkte: ${points}`}
                                                                ></div>
                                                            )}
                                                        </div>
                                                        <div className="absolute top-0 left-0 right-0 px-1 text-center pointer-events-none">
                                                            <div className={`text-xs ${points !== null && points < 0 ? 'text-red-600 dark:text-red-400' : 'text-blue-600 dark:text-blue-400' } whitespace-nowrap`}>
                                                                {points ?? '-'}
                                                            </div>
                                                            <div className="text-[10px] text-green-700 dark:text-green-400 whitespace-nowrap truncate">
                                                                {marketValue !== null ? (formatCurrency(marketValue).replace('€', '').replace('.000', 'k').replace('.',',')) : '-'}
                                                            </div>
                                                        </div>
                                                    </td>
                                                );
                                            })}
                                        </tr>

                                        {/* Punkte */}
                                        <tr>
                                            <td className="px-3 py-2 text-left text-xs font-medium text-gray-600 dark:text-gray-300 sticky left-0 bg-white dark:bg-gray-800 z-10 w-24">Punkte:</td>
                                            {combinedMatchdayData.map(({ matchday, points }) => {
                                                let pc = "text-gray-500 dark:text-gray-400"; if (points !== null && points > 0) pc = "text-green-600 dark:text-green-400 font-medium"; else if (points !== null && points < 0) pc = "text-red-600 dark:text-red-400 font-medium";
                                                return (<td key={`pts-data-${matchday}`} className={`px-3 py-2 text-center text-xs ${pc} w-16`}>{points ?? '-'}</td>);
                                            })}
                                        </tr>

                                        {/* Marktwert */}
                                        <tr className="bg-gray-50 dark:bg-gray-700/50">
                                            <td className="px-3 py-2 text-left text-xs font-medium text-gray-600 dark:text-gray-300 sticky left-0 bg-gray-50 dark:bg-gray-700/50 z-10 w-24">Marktwert:</td>
                                            {combinedMatchdayData.map(({ matchday, marketValueFormatted }) => (<td key={`mv-data-${matchday}`} className="px-3 py-2 text-center text-xs text-gray-500 dark:text-gray-400 w-16">{marketValueFormatted ? marketValueFormatted.replace(' €', '€') : '-'}</td>))}
                                        </tr>

                                        {/* Diff */}
                                        <tr>
                                            <td className="px-3 py-2 text-left text-xs font-medium text-gray-600 dark:text-gray-300 sticky left-0 bg-white dark:bg-gray-800 z-10 w-24">Diff:</td>
                                            {combinedMatchdayData.map(({ matchday, marketValue }, index) => {
                                                const prevMarketValue = index > 0 ? combinedMatchdayData[index - 1].marketValue : null;
                                                const diff = marketValue !== null && prevMarketValue !== null ? marketValue - prevMarketValue : null;
                                                const diffFormatted = diff !== null ? formatCurrency(diff).replace('€', '€') : '-';
                                                const diffColor = diff !== null ? (diff > 0 ? 'text-green-600 dark:text-green-400' : diff < 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-500 dark:text-gray-400') : 'text-gray-500 dark:text-gray-400';
                                                
                                                return (
                                                    <td key={`diff-${matchday}`} className={`px-3 py-2 text-center text-xs ${diffColor} w-16`}>
                                                        {diffFormatted}
                                                    </td>
                                                );
                                            })}
                                        </tr>

                                        {/* Note */}
                                        <tr>
                                            <td className="px-3 py-2 text-left text-xs font-medium text-gray-600 dark:text-gray-300 sticky left-0 bg-white dark:bg-gray-800 z-10 w-24">Note:</td>
                                            {Array.from({ length: 34 }, (_, i) => i + 1).map((matchday) => { const s = playerStats.find(stat => stat.matchday === matchday); const n = s?.liga_note; return <td key={matchday} className="px-3 py-2 text-center text-xs text-gray-500 dark:text-gray-400 w-16">{n !== null && !isNaN(Number(n)) ? Number(n).toFixed(1) : '-'}</td>; })}
                                        </tr>

                                        {/* S11 */}
                                        <tr className="bg-gray-50 dark:bg-gray-700/50">
                                            <td className="px-3 py-2 text-left text-xs font-medium text-gray-600 dark:text-gray-300 sticky left-0 bg-gray-50 dark:bg-gray-700/50 z-10 w-24">S11:</td>
                                            {Array.from({ length: 34 }, (_, i) => i + 1).map((matchday) => { const s = playerStats.find(stat => stat.matchday === matchday); return <td key={matchday} className="px-3 py-2 text-center text-xs text-gray-500 dark:text-gray-400 w-16">{s ? (s.started ? '✓' : '✗') : '-'}</td>; })}
                                        </tr>

                                        {/* Minuten */}
                                        <tr>
                                            <td className="px-3 py-2 text-left text-xs font-medium text-gray-600 dark:text-gray-300 sticky left-0 bg-white dark:bg-gray-800 z-10 w-24">Min:</td>
                                            {Array.from({ length: 34 }, (_, i) => i + 1).map((matchday) => { const s = playerStats.find(stat => stat.matchday === matchday); return <td key={matchday} className="px-3 py-2 text-center text-xs text-gray-500 dark:text-gray-400 w-16">{s ? s.minutes : '0'}</td>; })}
                                        </tr>

                                        {/* Status */}
                                        <tr className="bg-gray-50 dark:bg-gray-700/50">
                                            <td className="px-3 py-2 text-left text-xs font-medium text-gray-600 dark:text-gray-300 sticky left-0 bg-gray-50 dark:bg-gray-700/50 z-10 w-24">Status:</td>
                                            {Array.from({ length: 34 }, (_, i) => i + 1).map((matchday) => {
                                                const s = playerStats.find(stat => stat.matchday === matchday);
                                                return (<td key={matchday} className="px-3 py-2 text-center text-xs text-gray-500 dark:text-gray-400 w-16">{s ? (s.status === 1 ? (<span className="text-red-600 dark:text-red-400" title={s.injury_text || 'Verletzt'}>⚕</span>) : s.status === 2 ? (<span className="text-yellow-600 dark:text-yellow-400" title="Fraglich">?</span>) : (<span className="text-green-600 dark:text-green-400" title="Fit">✓</span>)) : '-'}</td>);
                                            })}
                                        </tr>

                                        {/* Tore */}
                                        <tr>
                                            <td className="px-3 py-2 text-left text-xs font-medium text-gray-600 dark:text-gray-300 sticky left-0 bg-white dark:bg-gray-800 z-10 w-24">Tore:</td>
                                            {Array.from({ length: 34 }, (_, i) => i + 1).map((matchday) => { const s = playerStats.find(stat => stat.matchday === matchday); return <td key={matchday} className="px-3 py-2 text-center text-xs text-gray-500 dark:text-gray-400 w-16">{s && s.goals > 0 ? s.goals : '-'}</td>; })}
                                        </tr>

                                        {/* Assists */}
                                        <tr className="bg-gray-50 dark:bg-gray-700/50">
                                            <td className="px-3 py-2 text-left text-xs font-medium text-gray-600 dark:text-gray-300 sticky left-0 bg-gray-50 dark:bg-gray-700/50 z-10 w-24">Assists:</td>
                                            {Array.from({ length: 34 }, (_, i) => i + 1).map((matchday) => { const s = playerStats.find(stat => stat.matchday === matchday); return <td key={matchday} className="px-3 py-2 text-center text-xs text-gray-500 dark:text-gray-400 w-16">{s && s.assist > 0 ? s.assist : '-'}</td>; })}
                                        </tr>

                                        {/* Gelb */}
                                        <tr>
                                            <td className="px-3 py-2 text-left text-xs font-medium text-gray-600 dark:text-gray-300 sticky left-0 bg-white dark:bg-gray-800 z-10 w-24">Gelb:</td>
                                            {Array.from({ length: 34 }, (_, i) => i + 1).map((matchday) => { const s = playerStats.find(stat => stat.matchday === matchday); return (<td key={matchday} className="px-3 py-2 text-center text-xs text-gray-500 dark:text-gray-400 w-16">{s && s.yellow > 0 ? (<span className="inline-flex items-center justify-center w-4 h-4 bg-yellow-400 rounded-sm text-[10px] text-gray-900">{s.yellow}</span>) : '-'}</td>); })}
                                        </tr>

                                        {/* Rot */}
                                        <tr className="bg-gray-50 dark:bg-gray-700/50">
                                            <td className="px-3 py-2 text-left text-xs font-medium text-gray-600 dark:text-gray-300 sticky left-0 bg-gray-50 dark:bg-gray-700/50 z-10 w-24">Rot:</td>
                                            {Array.from({ length: 34 }, (_, i) => i + 1).map((matchday) => { const s = playerStats.find(stat => stat.matchday === matchday); return (<td key={matchday} className="px-3 py-2 text-center text-xs text-gray-500 dark:text-gray-400 w-16">{s && s.red > 0 ? (<span className="inline-flex items-center justify-center w-4 h-4 bg-red-600 rounded-sm text-[10px] text-white">{s.red}</span>) : '-'}</td>); })}
                                        </tr>

                                        {/* Forecast */}
                                        <tr>
                                            <td className="px-3 py-2 text-left text-xs font-medium text-gray-600 dark:text-gray-300 sticky left-0 bg-white dark:bg-gray-800 z-10 w-24">Forecast:</td>
                                            {Array.from({ length: 34 }, (_, i) => i + 1).map((matchday) => { const s = playerStats.find(stat => stat.matchday === matchday); return <td key={matchday} className="px-3 py-2 text-center text-xs text-gray-500 dark:text-gray-400 w-16">{s && s.forecast !== null ? s.forecast : '-'}</td>; })}
                                        </tr>

                                        {/* Heim-W */}
                                        <tr className="bg-gray-50 dark:bg-gray-700/50">
                                            <td className="px-3 py-2 text-left text-xs font-medium text-gray-600 dark:text-gray-300 sticky left-0 bg-gray-50 dark:bg-gray-700/50 z-10 w-24">Heim-W:</td>
                                            {Array.from({ length: 34 }, (_, i) => i + 1).map((matchday) => { const m = clubMatches.find(match => match.matchday === matchday); return (<td key={matchday} className="px-3 py-2 text-center text-xs text-gray-500 dark:text-gray-400 w-16">{m ? `${(m.home_probabilities * 100).toFixed(0)}%` : '-'}</td>); })}
                                        </tr>

                                        {/* Unentschieden */}
                                        <tr>
                                            <td className="px-3 py-2 text-left text-xs font-medium text-gray-600 dark:text-gray-300 sticky left-0 bg-white dark:bg-gray-800 z-10 w-24">Unentsch.:</td>
                                            {Array.from({ length: 34 }, (_, i) => i + 1).map((matchday) => { const m = clubMatches.find(match => match.matchday === matchday); return (<td key={matchday} className="px-3 py-2 text-center text-xs text-gray-500 dark:text-gray-400 w-16">{m ? `${(m.draw_probabilities * 100).toFixed(0)}%` : '-'}</td>); })}
                                        </tr>

                                        {/* Auswärts-W */}
                                        <tr className="bg-gray-50 dark:bg-gray-700/50">
                                            <td className="px-3 py-2 text-left text-xs font-medium text-gray-600 dark:text-gray-300 sticky left-0 bg-gray-50 dark:bg-gray-700/50 z-10 w-24">Auswärts-W:</td>
                                            {Array.from({ length: 34 }, (_, i) => i + 1).map((matchday) => { const m = clubMatches.find(match => match.matchday === matchday); return (<td key={matchday} className="px-3 py-2 text-center text-xs text-gray-500 dark:text-gray-400 w-16">{m ? `${(m.away_probabilities * 100).toFixed(0)}%` : '-'}</td>); })}
                                        </tr>
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}

// Wrap with Suspense for useSearchParams
export default function PlayerPage() {
    return (
        <Suspense fallback={<div className="p-6 text-center">Spielerdetails werden geladen...</div>}>
            <PlayerInfoContent />
        </Suspense>
    );
}