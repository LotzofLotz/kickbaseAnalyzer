'use client';

import { Suspense, useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { formatCurrency } from '@/lib/kickbase-api'; // Assuming formatCurrency is exported there
import { getPositionName, getStatusName, getTeamData } from '@/utils/player.utils';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const CDN_BASE_URL = 'https://kickbase.b-cdn.net/';

// Value history interface
interface ValueHistory {
    player_id: string;
    date: string;
    value: number;
}

// Player stats interface
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

// Club matches interface
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

// Helper to decode or return default
const getQueryParam = (params: URLSearchParams | null, key: string, defaultValue: string = '-') => {
    return params?.get(key) ? decodeURIComponent(params.get(key)!) : defaultValue;
};

function PlayerInfoContent() {
    const router = useRouter();
    const searchParams = useSearchParams();

    // Extract player data from URL parameters
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
    const playerImage = getQueryParam(searchParams, 'playerImage'); // Can be pim or profileImage etc.
    const mvt = parseInt(getQueryParam(searchParams, 'mvt', '-1')); // Market Value Trend

    const [leagueImage, setLeagueImage] = useState<string | null>(null);
    const [valueHistory, setValueHistory] = useState<ValueHistory[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    
    // Spielerstatistiken
    const [playerStats, setPlayerStats] = useState<PlayerStats[]>([]);
    const [statsLoading, setStatsLoading] = useState(false);
    const [statsError, setStatsError] = useState<string | null>(null);
    
    // Vereinsspiele
    const [clubMatches, setClubMatches] = useState<ClubMatch[]>([]);
    const [matchesLoading, setMatchesLoading] = useState(false);
    const [matchesError, setMatchesError] = useState<string | null>(null);

    // Get league image from localStorage
    useEffect(() => {
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
        const fetchValueHistory = async () => {
            if (!playerId || playerId === '-') return;
            
            setIsLoading(true);
            setError(null);
            try {
                // Construct the URL with query parameter
                const apiUrl = `/api/player-values?playerId=${encodeURIComponent(playerId)}`;
                console.log("Fetching player values from:", apiUrl);

                const response = await fetch(apiUrl);
                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
                }
                const data: ValueHistory[] = await response.json();
                setValueHistory(data);
                console.log(`Fetched ${data.length} value entries for player ${playerId}`);

            } catch (e) {
                console.error("Failed to fetch player values:", e);
                setError(e instanceof Error ? e.message : 'Failed to load player values.');
            } finally {
                setIsLoading(false);
            }
        };

        fetchValueHistory();
    }, [playerId]);

    // Fetch player stats
    useEffect(() => {
        const fetchPlayerStats = async () => {
            if (!playerId || playerId === '-') return;
            
            setStatsLoading(true);
            setStatsError(null);
            try {
                // Construct the URL with query parameter
                const apiUrl = `/api/player-stats?playerId=${encodeURIComponent(playerId)}`;
                console.log("Fetching player stats from:", apiUrl);

                const response = await fetch(apiUrl);
                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
                }
                const data: PlayerStats[] = await response.json();
                setPlayerStats(data);
                console.log(`Fetched ${data.length} stat entries for player ${playerId}`);

            } catch (e) {
                console.error("Failed to fetch player stats:", e);
                setStatsError(e instanceof Error ? e.message : 'Failed to load player statistics.');
            } finally {
                setStatsLoading(false);
            }
        };

        fetchPlayerStats();
    }, [playerId]);

    // Fetch club matches
    useEffect(() => {
        const fetchClubMatches = async () => {
            if (!teamId || teamId === '-') return;
            
            setMatchesLoading(true);
            setMatchesError(null);
            try {
                // Construct the URL with query parameter
                const apiUrl = `/api/club-matches?clubId=${encodeURIComponent(teamId)}`;
                console.log("Fetching club matches from:", apiUrl);

                const response = await fetch(apiUrl);
                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
                }
                const data: ClubMatch[] = await response.json();
                setClubMatches(data);
                console.log(`Fetched ${data.length} match entries for club ${teamId}`);

            } catch (e) {
                console.error("Failed to fetch club matches:", e);
                setMatchesError(e instanceof Error ? e.message : 'Failed to load club matches.');
            } finally {
                setMatchesLoading(false);
            }
        };

        fetchClubMatches();
    }, [teamId]);

    const teamData = getTeamData(teamId ?? '');

    // Construct full image URL
    const imageUrl = playerImage && playerImage !== '-' 
                     ? (playerImage.startsWith('http') || playerImage.startsWith('/') ? playerImage : `${CDN_BASE_URL}${playerImage}`) 
                     : '/placeholder.png';

    // Determine trend icon and color (copied from market page logic)
    let trendIcon = '→';
    let trendColor = 'text-gray-500 dark:text-gray-400';
    if (mvt === 1) { // Up
        trendIcon = '↑';
        trendColor = 'text-green-600 dark:text-green-400';
    } else if (mvt === 2) { // Down
        trendIcon = '↓';
        trendColor = 'text-red-600 dark:text-red-400';
    }

    const handleBack = () => router.back();

    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-900 dark:to-gray-800">
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
            <main className="max-w-4xl mx-auto py-6 sm:px-6 lg:px-8">
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
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
                         {/* Add more fields here later as needed */}
                    </div>
                </div>
                
                {/* Player Stats Section */}
                <div className="mt-6 bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
                    <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                        <h3 className="text-lg font-medium text-gray-900 dark:text-white">Spieler- und Vereinsdaten</h3>
                    </div>
                    
                    <div className="px-6 py-4">
                        {statsLoading || matchesLoading ? (
                            <p className="text-gray-600 dark:text-gray-400 text-center py-4">Lade Daten...</p>
                        ) : statsError || matchesError ? (
                            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative dark:bg-red-900/30 dark:border-red-600 dark:text-red-300">
                                <strong className="font-bold">Fehler!</strong>
                                <span className="block sm:inline"> {statsError || matchesError}</span>
                            </div>
                        ) : playerStats.length === 0 && clubMatches.length === 0 ? (
                            <p className="text-gray-600 dark:text-gray-400 text-center py-4">Keine Daten verfügbar.</p>
                        ) : (
                            <div>
                                {/* Kombinierte Tabelle mit Spieler- und Vereinsdaten */}
                                <div className="overflow-x-auto mb-6">
                                    <div className="min-w-max">
                                        <table className="divide-y divide-gray-200 dark:divide-gray-700">
                                            <thead className="bg-gray-50 dark:bg-gray-700">
                                                <tr>
                                                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider w-16 sticky left-0 bg-gray-50 dark:bg-gray-700 z-10">
                                                        MD:
                                                    </th>
                                                    {Array.from({ length: 34 }, (_, i) => i + 1).map((matchday) => (
                                                        <th key={matchday} scope="col" className="px-3 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                                                            {matchday}
                                                        </th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                                                {/* Datum */}
                                                <tr className="bg-gray-50 dark:bg-gray-700/50">
                                                    <td className="px-3 py-2 text-left text-sm font-medium text-gray-600 dark:text-gray-300 sticky left-0 bg-gray-50 dark:bg-gray-700/50 z-10">
                                                        Datum:
                                                    </td>
                                                    {Array.from({ length: 34 }, (_, i) => i + 1).map((matchday) => {
                                                        const matchingMatch = clubMatches.find(match => match.matchday === matchday);
                                                        const formattedDate = matchingMatch?.match_date ? 
                                                            new Date(matchingMatch.match_date).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }) : '-';
                                                        return (
                                                            <td key={matchday} className="px-3 py-2 text-center text-sm text-gray-500 dark:text-gray-400">
                                                                {formattedDate}
                                                            </td>
                                                        );
                                                    })}
                                                </tr>
                                                
                                                {/* Heim/Auswärts */}
                                                <tr>
                                                    <td className="px-3 py-2 text-left text-sm font-medium text-gray-600 dark:text-gray-300 sticky left-0 bg-white dark:bg-gray-800 z-10">
                                                        Place:
                                                    </td>
                                                    {Array.from({ length: 34 }, (_, i) => i + 1).map((matchday) => {
                                                        const matchingMatch = clubMatches.find(match => match.matchday === matchday);
                                                        
                                                        const playerTeamId = String(teamId);
                                                        const homeClubId = String(matchingMatch?.home_club_id || '');
                                                        const isHome = playerTeamId === homeClubId;
                                                        
                                                        return (
                                                            <td key={matchday} className="px-3 py-2 text-center text-sm text-gray-500 dark:text-gray-400">
                                                                {matchingMatch ? (isHome ? 'H' : 'A') : '-'}
                                                            </td>
                                                        );
                                                    })}
                                                </tr>
                                                
                                                {/* Gegner */}
                                                <tr className="bg-gray-50 dark:bg-gray-700/50">
                                                    <td className="px-3 py-2 text-left text-sm font-medium text-gray-600 dark:text-gray-300 sticky left-0 bg-gray-50 dark:bg-gray-700/50 z-10">
                                                        Gegner:
                                                    </td>
                                                    {Array.from({ length: 34 }, (_, i) => i + 1).map((matchday) => {
                                                        const matchingMatch = clubMatches.find(match => match.matchday === matchday);
                                                        if (!matchingMatch) return <td key={matchday} className="px-3 py-2 text-center text-sm text-gray-500 dark:text-gray-400">-</td>;
                                                        
                                                        const playerTeamId = String(teamId);
                                                        const homeClubId = String(matchingMatch.home_club_id || '');
                                                        const isHome = playerTeamId === homeClubId;
                                                        
                                                        const opponentShortname = isHome ? 
                                                            matchingMatch.away_club_shortname : 
                                                            matchingMatch.home_club_shortname;
                                                        
                                                        return (
                                                            <td key={matchday} className="px-3 py-2 text-center text-sm text-gray-500 dark:text-gray-400">
                                                                {opponentShortname || '-'}
                                                            </td>
                                                        );
                                                    })}
                                                </tr>
                                                
                                                {/* Ergebnis */}
                                                <tr>
                                                    <td className="px-3 py-2 text-left text-sm font-medium text-gray-600 dark:text-gray-300 sticky left-0 bg-white dark:bg-gray-800 z-10">
                                                        Ergebnis:
                                                    </td>
                                                    {Array.from({ length: 34 }, (_, i) => i + 1).map((matchday) => {
                                                        const matchingMatch = clubMatches.find(match => match.matchday === matchday);
                                                        return (
                                                            <td key={matchday} className="px-3 py-2 text-center text-sm text-gray-500 dark:text-gray-400">
                                                                {matchingMatch ? `${matchingMatch.home_score}:${matchingMatch.away_score}` : '-'}
                                                            </td>
                                                        );
                                                    })}
                                                </tr>
                                                
                                                {/* W/D/L */}
                                                <tr className="bg-gray-50 dark:bg-gray-700/50">
                                                    <td className="px-3 py-2 text-left text-sm font-medium text-gray-600 dark:text-gray-300 sticky left-0 bg-gray-50 dark:bg-gray-700/50 z-10">
                                                        W/D/L:
                                                    </td>
                                                    {Array.from({ length: 34 }, (_, i) => i + 1).map((matchday) => {
                                                        const matchingMatch = clubMatches.find(match => match.matchday === matchday);
                                                        if (!matchingMatch) return <td key={matchday} className="px-3 py-2 text-center text-sm text-gray-500 dark:text-gray-400">-</td>;
                                                        
                                                        const playerTeamId = String(teamId);
                                                        const homeClubId = String(matchingMatch.home_club_id || '');
                                                        const isHome = playerTeamId === homeClubId;
                                                        
                                                        let result = 'D';
                                                        const homeScore = matchingMatch.home_score;
                                                        const awayScore = matchingMatch.away_score;
                                                        
                                                        if (homeScore > awayScore) {
                                                            result = isHome ? 'W' : 'L';
                                                        } else if (homeScore < awayScore) {
                                                            result = isHome ? 'L' : 'W';
                                                        }
                                                        
                                                        let resultClass = "text-yellow-500 dark:text-yellow-400 font-medium";
                                                        if (result === 'W') {
                                                            resultClass = "text-green-600 dark:text-green-400 font-bold";
                                                        } else if (result === 'L') {
                                                            resultClass = "text-red-600 dark:text-red-400 font-medium";
                                                        }
                                                        
                                                        return (
                                                            <td key={matchday} className={`px-3 py-2 text-center text-sm ${resultClass}`}>
                                                                {result}
                                                            </td>
                                                        );
                                                    })}
                                                </tr>
                                                
                                                {/* Punkte */}
                                                <tr className="bg-gray-50 dark:bg-gray-700/50">
                                                    <td className="px-3 py-2 text-left text-sm font-medium text-gray-600 dark:text-gray-300 sticky left-0 bg-gray-50 dark:bg-gray-700/50 z-10">
                                                        Punkte:
                                                    </td>
                                                    {Array.from({ length: 34 }, (_, i) => i + 1).map((matchday) => {
                                                        const matchingStat = playerStats.find(stat => stat.matchday === matchday);
                                                        
                                                        // Definiere eine CSS-Klasse basierend auf der Punktzahl
                                                        let pointClass = "text-gray-500 dark:text-gray-400";
                                                        if (matchingStat && matchingStat.points > 0) {
                                                            pointClass = "text-green-600 dark:text-green-400 font-medium";
                                                        } else if (matchingStat && matchingStat.points < 0) {
                                                            pointClass = "text-red-600 dark:text-red-400 font-medium";
                                                        }
                                                        
                                                        return (
                                                            <td key={matchday} className={`px-3 py-2 text-center text-sm ${pointClass}`}>
                                                                {matchingStat ? matchingStat.points : '-'}
                                                            </td>
                                                        );
                                                    })}
                                                </tr>
                                                
                                                {/* Marktwert */}
                                                <tr>
                                                    <td className="px-3 py-2 text-left text-sm font-medium text-gray-600 dark:text-gray-300 sticky left-0 bg-white dark:bg-gray-800 z-10">
                                                        Marktwert:
                                                    </td>
                                                    {Array.from({ length: 34 }, (_, i) => i + 1).map((matchday) => {
                                                        const matchingMatch = clubMatches.find(match => match.matchday === matchday);
                                                        if (!matchingMatch) return <td key={matchday} className="px-3 py-2 text-center text-sm text-gray-500 dark:text-gray-400">-</td>;
                                                        
                                                        // Finde die Werthistorie mit dem nächstliegenden Datum zum Spieltagsdatum
                                                        const matchDate = new Date(matchingMatch.match_date);
                                                        let closestValueEntry: ValueHistory | null = null;
                                                        let minDaysDiff = Infinity;
                                                        
                                                        valueHistory.forEach(entry => {
                                                            const entryDate = new Date(entry.date);
                                                            const daysDiff = Math.abs(matchDate.getTime() - entryDate.getTime()) / (1000 * 60 * 60 * 24);
                                                            
                                                            // Wir suchen den nächsten Wert, bevorzugt vor dem Spieltag (aber max. 7 Tage davor)
                                                            if (daysDiff < minDaysDiff && (entryDate <= matchDate || daysDiff <= 7)) {
                                                                minDaysDiff = daysDiff;
                                                                closestValueEntry = entry;
                                                            }
                                                        });
                                                        
                                                        return (
                                                            <td key={matchday} className="px-3 py-2 text-center text-sm text-gray-500 dark:text-gray-400">
                                                                {closestValueEntry && 'value' in closestValueEntry ? 
                                                                    formatCurrency(closestValueEntry.value).replace('€', '').trim() + '€' : 
                                                                    '-'}
                                                            </td>
                                                        );
                                                    })}
                                                </tr>
                                                
                                                {/* Minuten */}
                                                <tr>
                                                    <td className="px-3 py-2 text-left text-sm font-medium text-gray-600 dark:text-gray-300 sticky left-0 bg-white dark:bg-gray-800 z-10">
                                                        Min:
                                                    </td>
                                                    {Array.from({ length: 34 }, (_, i) => i + 1).map((matchday) => {
                                                        const matchingStat = playerStats.find(stat => stat.matchday === matchday);
                                                        return (
                                                            <td key={matchday} className="px-3 py-2 text-center text-sm text-gray-500 dark:text-gray-400">
                                                                {matchingStat ? matchingStat.minutes : '0'}
                                                            </td>
                                                        );
                                                    })}
                                                </tr>
                                                
                                                {/* Note */}
                                                <tr className="bg-gray-50 dark:bg-gray-700/50">
                                                    <td className="px-3 py-2 text-left text-sm font-medium text-gray-600 dark:text-gray-300 sticky left-0 bg-gray-50 dark:bg-gray-700/50 z-10">
                                                        Note:
                                                    </td>
                                                    {Array.from({ length: 34 }, (_, i) => i + 1).map((matchday) => {
                                                        const matchingStat = playerStats.find(stat => stat.matchday === matchday);
                                                        return (
                                                            <td key={matchday} className="px-3 py-2 text-center text-sm text-gray-500 dark:text-gray-400">
                                                                {matchingStat && matchingStat.liga_note !== null && !isNaN(Number(matchingStat.liga_note)) 
                                                                    ? Number(matchingStat.liga_note).toFixed(1) 
                                                                    : '-'}
                                                            </td>
                                                        );
                                                    })}
                                                </tr>
                                                
                                                {/* Startelf */}
                                                <tr>
                                                    <td className="px-3 py-2 text-left text-sm font-medium text-gray-600 dark:text-gray-300 sticky left-0 bg-white dark:bg-gray-800 z-10">
                                                        S11:
                                                    </td>
                                                    {Array.from({ length: 34 }, (_, i) => i + 1).map((matchday) => {
                                                        const matchingStat = playerStats.find(stat => stat.matchday === matchday);
                                                        return (
                                                            <td key={matchday} className="px-3 py-2 text-center text-sm text-gray-500 dark:text-gray-400">
                                                                {matchingStat ? (matchingStat.started ? '✓' : '✗') : '-'}
                                                            </td>
                                                        );
                                                    })}
                                                </tr>
                                                
                                                {/* Status */}
                                                <tr className="bg-gray-50 dark:bg-gray-700/50">
                                                    <td className="px-3 py-2 text-left text-sm font-medium text-gray-600 dark:text-gray-300 sticky left-0 bg-gray-50 dark:bg-gray-700/50 z-10">
                                                        Status:
                                                    </td>
                                                    {Array.from({ length: 34 }, (_, i) => i + 1).map((matchday) => {
                                                        const matchingStat = playerStats.find(stat => stat.matchday === matchday);
                                                        return (
                                                            <td key={matchday} className="px-3 py-2 text-center text-sm text-gray-500 dark:text-gray-400">
                                                                {matchingStat ? (
                                                                    matchingStat.status === 1 ? (
                                                                        <span className="text-red-600 dark:text-red-400" title={matchingStat.injury_text || 'Verletzt'}>⚕</span>
                                                                    ) : matchingStat.status === 2 ? (
                                                                        <span className="text-yellow-600 dark:text-yellow-400" title="Fraglich">?</span>
                                                                    ) : (
                                                                        <span className="text-green-600 dark:text-green-400" title="Fit">✓</span>
                                                                    )
                                                                ) : '-'}
                                                            </td>
                                                        );
                                                    })}
                                                </tr>
                                                
                                                {/* Tore */}
                                                <tr>
                                                    <td className="px-3 py-2 text-left text-sm font-medium text-gray-600 dark:text-gray-300 sticky left-0 bg-white dark:bg-gray-800 z-10">
                                                        Tore:
                                                    </td>
                                                    {Array.from({ length: 34 }, (_, i) => i + 1).map((matchday) => {
                                                        const matchingStat = playerStats.find(stat => stat.matchday === matchday);
                                                        return (
                                                            <td key={matchday} className="px-3 py-2 text-center text-sm text-gray-500 dark:text-gray-400">
                                                                {matchingStat && matchingStat.goals > 0 ? matchingStat.goals : '-'}
                                                            </td>
                                                        );
                                                    })}
                                                </tr>
                                                
                                                {/* Assists */}
                                                <tr className="bg-gray-50 dark:bg-gray-700/50">
                                                    <td className="px-3 py-2 text-left text-sm font-medium text-gray-600 dark:text-gray-300 sticky left-0 bg-gray-50 dark:bg-gray-700/50 z-10">
                                                        Assists:
                                                    </td>
                                                    {Array.from({ length: 34 }, (_, i) => i + 1).map((matchday) => {
                                                        const matchingStat = playerStats.find(stat => stat.matchday === matchday);
                                                        return (
                                                            <td key={matchday} className="px-3 py-2 text-center text-sm text-gray-500 dark:text-gray-400">
                                                                {matchingStat && matchingStat.assist > 0 ? matchingStat.assist : '-'}
                                                            </td>
                                                        );
                                                    })}
                                                </tr>
                                                
                                                {/* Forecast */}
                                                <tr>
                                                    <td className="px-3 py-2 text-left text-sm font-medium text-gray-600 dark:text-gray-300 sticky left-0 bg-white dark:bg-gray-800 z-10">
                                                        Forecast:
                                                    </td>
                                                    {Array.from({ length: 34 }, (_, i) => i + 1).map((matchday) => {
                                                        const matchingStat = playerStats.find(stat => stat.matchday === matchday);
                                                        return (
                                                            <td key={matchday} className="px-3 py-2 text-center text-sm text-gray-500 dark:text-gray-400">
                                                                {matchingStat && matchingStat.forecast !== null ? matchingStat.forecast : '-'}
                                                            </td>
                                                        );
                                                    })}
                                                </tr>
                                                
                                                {/* Gelbe Karten */}
                                                <tr className="bg-gray-50 dark:bg-gray-700/50">
                                                    <td className="px-3 py-2 text-left text-sm font-medium text-gray-600 dark:text-gray-300 sticky left-0 bg-gray-50 dark:bg-gray-700/50 z-10">
                                                        Gelb:
                                                    </td>
                                                    {Array.from({ length: 34 }, (_, i) => i + 1).map((matchday) => {
                                                        const matchingStat = playerStats.find(stat => stat.matchday === matchday);
                                                        return (
                                                            <td key={matchday} className="px-3 py-2 text-center text-sm text-gray-500 dark:text-gray-400">
                                                                {matchingStat && matchingStat.yellow > 0 ? (
                                                                    <span className="inline-flex items-center justify-center w-5 h-5 bg-yellow-400 rounded-sm text-xs text-gray-900">
                                                                        {matchingStat.yellow}
                                                                    </span>
                                                                ) : '-'}
                                                            </td>
                                                        );
                                                    })}
                                                </tr>
                                                
                                                {/* Rote Karten */}
                                                <tr>
                                                    <td className="px-3 py-2 text-left text-sm font-medium text-gray-600 dark:text-gray-300 sticky left-0 bg-white dark:bg-gray-800 z-10">
                                                        Rot:
                                                    </td>
                                                    {Array.from({ length: 34 }, (_, i) => i + 1).map((matchday) => {
                                                        const matchingStat = playerStats.find(stat => stat.matchday === matchday);
                                                        return (
                                                            <td key={matchday} className="px-3 py-2 text-center text-sm text-gray-500 dark:text-gray-400">
                                                                {matchingStat && matchingStat.red > 0 ? (
                                                                    <span className="inline-flex items-center justify-center w-5 h-5 bg-red-600 rounded-sm text-xs text-white">
                                                                        {matchingStat.red}
                                                                    </span>
                                                                ) : '-'}
                                                            </td>
                                                        );
                                                    })}
                                                </tr>
                                                
                                                {/* Heim-Wahrscheinlichkeit */}
                                                <tr className="bg-gray-50 dark:bg-gray-700/50">
                                                    <td className="px-3 py-2 text-left text-sm font-medium text-gray-600 dark:text-gray-300 sticky left-0 bg-gray-50 dark:bg-gray-700/50 z-10">
                                                        Heim-W:
                                                    </td>
                                                    {Array.from({ length: 34 }, (_, i) => i + 1).map((matchday) => {
                                                        const matchingMatch = clubMatches.find(match => match.matchday === matchday);
                                                        return (
                                                            <td key={matchday} className="px-3 py-2 text-center text-sm text-gray-500 dark:text-gray-400">
                                                                {matchingMatch ? `${(matchingMatch.home_probabilities * 100).toFixed(1)}%` : '-'}
                                                            </td>
                                                        );
                                                    })}
                                                </tr>
                                                
                                                {/* Unentschieden-Wahrscheinlichkeit */}
                                                <tr>
                                                    <td className="px-3 py-2 text-left text-sm font-medium text-gray-600 dark:text-gray-300 sticky left-0 bg-white dark:bg-gray-800 z-10">
                                                        Unentschieden:
                                                    </td>
                                                    {Array.from({ length: 34 }, (_, i) => i + 1).map((matchday) => {
                                                        const matchingMatch = clubMatches.find(match => match.matchday === matchday);
                                                        return (
                                                            <td key={matchday} className="px-3 py-2 text-center text-sm text-gray-500 dark:text-gray-400">
                                                                {matchingMatch ? `${(matchingMatch.draw_probabilities * 100).toFixed(1)}%` : '-'}
                                                            </td>
                                                        );
                                                    })}
                                                </tr>
                                                
                                                {/* Auswärts-Wahrscheinlichkeit */}
                                                <tr className="bg-gray-50 dark:bg-gray-700/50">
                                                    <td className="px-3 py-2 text-left text-sm font-medium text-gray-600 dark:text-gray-300 sticky left-0 bg-gray-50 dark:bg-gray-700/50 z-10">
                                                        Auswärts-W:
                                                    </td>
                                                    {Array.from({ length: 34 }, (_, i) => i + 1).map((matchday) => {
                                                        const matchingMatch = clubMatches.find(match => match.matchday === matchday);
                                                        return (
                                                            <td key={matchday} className="px-3 py-2 text-center text-sm text-gray-500 dark:text-gray-400">
                                                                {matchingMatch ? `${(matchingMatch.away_probabilities * 100).toFixed(1)}%` : '-'}
                                                            </td>
                                                        );
                                                    })}
                                                </tr>
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
                
                {/* Diagramme Section */}
                <div className="mt-6 bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
                    <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                        <h3 className="text-lg font-medium text-gray-900 dark:text-white">Diagramme</h3>
                    </div>
                    
                    <div className="px-6 py-4">
                        {(isLoading || statsLoading) ? (
                            <p className="text-gray-600 dark:text-gray-400 text-center py-4">Lade Diagrammdaten...</p>
                        ) : (error || statsError) ? (
                            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative dark:bg-red-900/30 dark:border-red-600 dark:text-red-300">
                                <strong className="font-bold">Fehler!</strong>
                                <span className="block sm:inline"> {error || statsError}</span>
                            </div>
                        ) : (valueHistory.length === 0 && playerStats.length === 0) ? (
                            <p className="text-gray-600 dark:text-gray-400 text-center py-4">Keine Diagrammdaten verfügbar.</p>
                        ) : (
                            <div>
                                {/* Diagramm für Wertentwicklung */}
                                {valueHistory.length > 0 && (
                                    <div>
                                        <h4 className="text-lg font-medium text-gray-900 dark:text-white mb-3">Wertentwicklung</h4>
                                        <div className="h-64 w-full mb-6">
                                            <ResponsiveContainer width="100%" height="100%">
                                                <LineChart
                                                    data={valueHistory
                                                        .slice() // Kopieren des Arrays
                                                        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()) // Nach Datum sortieren (aufsteigend)
                                                        .map((entry: ValueHistory) => ({
                                                            ...entry,
                                                            formattedDate: new Date(entry.date).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }),
                                                        }))}
                                                    margin={{ top: 5, right: 30, left: 20, bottom: 25 }}
                                                >
                                                    <CartesianGrid strokeDasharray="3 3" stroke="#d1d5db" />
                                                    <XAxis 
                                                        dataKey="formattedDate" 
                                                        tick={{ fill: '#6b7280', fontSize: 12 }}
                                                        tickMargin={10}
                                                    />
                                                    <YAxis 
                                                        tick={{ fill: '#6b7280', fontSize: 12 }}
                                                        tickFormatter={(value) => formatCurrency(value).replace('€', '')}
                                                        width={60}
                                                        domain={[0, Math.max(...valueHistory.map(entry => entry.value))]}
                                                    />
                                                    <Tooltip 
                                                        formatter={(value: number) => [formatCurrency(value), "Marktwert"]}
                                                        labelFormatter={(date) => `Datum: ${date}`}
                                                        contentStyle={{ backgroundColor: '#f9fafb', borderRadius: '0.375rem', border: '1px solid #e5e7eb' }}
                                                    />
                                                    <Legend />
                                                    <Line 
                                                        type="monotone" 
                                                        dataKey="value" 
                                                        name="Marktwert" 
                                                        stroke="#3b82f6" 
                                                        activeDot={{ r: 8 }} 
                                                        strokeWidth={2}
                                                    />
                                                </LineChart>
                                            </ResponsiveContainer>
                                        </div>
                                    </div>
                                )}
                                
                                {/* Diagramm für Punkteverlauf */}
                                {playerStats.length > 0 && (
                                    <div>
                                        <h4 className="text-lg font-medium text-gray-900 dark:text-white mb-3">Punkteverlauf</h4>
                                        <div className="h-64 w-full mb-6">
                                            <ResponsiveContainer width="100%" height="100%">
                                                <BarChart
                                                    data={playerStats
                                                        .slice()
                                                        .sort((a, b) => a.matchday - b.matchday)}
                                                    margin={{ top: 5, right: 30, left: 20, bottom: 25 }}
                                                >
                                                    <CartesianGrid strokeDasharray="3 3" stroke="#d1d5db" />
                                                    <XAxis 
                                                        dataKey="matchday" 
                                                        tick={{ fill: '#6b7280', fontSize: 12 }}
                                                        tickMargin={10}
                                                        label={{ value: 'Spieltag', position: 'insideBottom', offset: -10 }}
                                                    />
                                                    <YAxis 
                                                        tick={{ fill: '#6b7280', fontSize: 12 }}
                                                        width={40}
                                                        domain={[0, Math.max(...playerStats.map(entry => entry.points)) + 5]}
                                                        label={{ value: 'Punkte', angle: -90, position: 'insideLeft' }}
                                                    />
                                                    <Tooltip 
                                                        formatter={(value: number) => [`${value}`, "Punkte"]}
                                                        labelFormatter={(matchday) => `Spieltag: ${matchday}`}
                                                        contentStyle={{ backgroundColor: '#f9fafb', borderRadius: '0.375rem', border: '1px solid #e5e7eb' }}
                                                    />
                                                    <Legend />
                                                    <Bar 
                                                        dataKey="points" 
                                                        name="Punkte" 
                                                        fill="#3b82f6"
                                                        radius={[4, 4, 0, 0]}
                                                    />
                                                </BarChart>
                                            </ResponsiveContainer>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
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