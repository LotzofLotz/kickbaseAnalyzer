'use client';

import { Suspense, useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { formatCurrency } from '@/lib/kickbase-api';
import { getPositionName, getStatusName, getTeamData } from '@/utils/player.utils';

const CDN_BASE_URL = 'https://kickbase.b-cdn.net/';

// Interfaces
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
    home_heuristics: number;
    away_heuristics: number;
    draw_heuristics: number;
}

interface MatchdayVizData {
    matchday: number;
    points: number | null;
    marketValue: number | null;
    marketValueFormatted: string | null;
}

interface PlayerNews {
    player_id: number;
    date: string;
    time: string;
    title: string;
    link: string;
    comprehension: string;
    category: string;
}

const getQueryParam = (params: URLSearchParams | null, key: string, defaultValue: string = '-') => {
    return params?.get(key) ? decodeURIComponent(params.get(key)!) : defaultValue;
};

const findMarketValueForMatchday = (matchday: number, clubMatches: ClubMatch[], valueHistory: ValueHistory[]): number | null => {
    const matchingMatch = clubMatches.find(match => match.matchday === matchday);
    if (!matchingMatch || !matchingMatch.match_date) return null;

    const matchDate = new Date(matchingMatch.match_date);
    let closestValueEntry: ValueHistory | null = null;
    let minDaysDiff = Infinity;

    valueHistory.forEach(entry => {
        const entryDate = new Date(entry.date);
        const timeDiff = entryDate.getTime() - matchDate.getTime();
        const daysDiff = timeDiff / (1000 * 60 * 60 * 24);

        if (entryDate <= matchDate) {
            const absDaysDiff = Math.abs(daysDiff);
            if (absDaysDiff < minDaysDiff) {
                minDaysDiff = absDaysDiff;
                closestValueEntry = entry;
            }
        } else if (closestValueEntry === null && daysDiff <= 3 && daysDiff < minDaysDiff) {
             minDaysDiff = daysDiff;
             closestValueEntry = entry;
        }
    });
    return closestValueEntry ? closestValueEntry.value : null;
};


// Helper function to render table body rows - to avoid duplication
interface RenderTableBodyRowsProps {
    matchdaysToDisplay: number[];
    relevantCombinedData: MatchdayVizData[];
    fullCombinedData: MatchdayVizData[];
    playerStats: PlayerStats[];
    clubMatches: ClubMatch[];
    teamId: string;
    maxPoints: number;
    minPoints: number;
    maxMarketValue: number;
    selectedMatchday: number;
}

const RenderTableBodyRows: React.FC<RenderTableBodyRowsProps> = ({
    matchdaysToDisplay,
    relevantCombinedData,
    fullCombinedData,
    playerStats,
    clubMatches,
    teamId,
    maxPoints,
    minPoints,
    maxMarketValue,
    selectedMatchday
}) => {
    return (
        <>
            {/* Datum */}
            <tr className="bg-gray-50 dark:bg-gray-700/50">
                <td className="px-3 py-2 text-left text-xs font-medium text-gray-600 dark:text-gray-300 sticky left-0 bg-gray-50 dark:bg-gray-700/50 z-10 w-24">Datum:</td>
                {matchdaysToDisplay.map((matchday) => {
                    const matchingMatch = clubMatches.find(match => match.matchday === matchday);
                    const formattedDate = matchingMatch?.match_date ? new Date(matchingMatch.match_date).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }) : '-';
                    return (<td key={`date-${matchday}`} className="px-3 py-2 text-center text-xs text-gray-500 dark:text-gray-400 w-20">{formattedDate}</td>);
                })}
            </tr>

            {/* W/D/L */}
            <tr>
                <td className="px-3 py-2 text-left text-xs font-medium text-gray-600 dark:text-gray-300 sticky left-0 bg-white dark:bg-gray-800 z-10 w-24">W/D/L:</td>
                {matchdaysToDisplay.map((matchday) => {
                    const matchingMatch = clubMatches.find(match => match.matchday === matchday);
                    if (!matchingMatch) return <td key={`wdl-result-${matchday}`} className="px-3 py-2 text-center text-xs text-gray-500 dark:text-gray-400 w-16">-</td>;
                    
                    const isHome = String(teamId) === String(matchingMatch.home_club_id);
                    const hs = matchingMatch.home_score;
                    const as = matchingMatch.away_score;
                    
                    let result = 'D';
                    if (hs > as) {
                        result = isHome ? 'W' : 'L';
                    } else if (hs < as) {
                        result = isHome ? 'L' : 'W';
                    }
                    
                    let resultColor = "text-yellow-500 dark:text-yellow-400 font-medium";
                    if (result === 'W') {
                        resultColor = "text-green-600 dark:text-green-400 font-bold";
                    } else if (result === 'L') {
                        resultColor = "text-red-600 dark:text-red-400 font-medium";
                    }

                    return <td key={`wdl-result-${matchday}`} className={`px-3 py-2 text-center text-xs ${resultColor} w-16`}>{result}</td>;
                })}
            </tr>

            {/* Gegner */}
            <tr className="bg-gray-50 dark:bg-gray-700/50">
                <td className="px-3 py-2 text-left text-xs font-medium text-gray-600 dark:text-gray-300 sticky left-0 bg-gray-50 dark:bg-gray-700/50 z-10 w-24">Gegner:</td>
                {matchdaysToDisplay.map((matchday) => {
                    const matchingMatch = clubMatches.find(match => match.matchday === matchday);
                    if (!matchingMatch) return <td key={`opp-${matchday}`} className="px-3 py-2 text-center text-xs text-gray-500 dark:text-gray-400 w-16">-</td>;
                    const isHome = String(teamId) === String(matchingMatch.home_club_id);
                    const opponentShortname = isHome ? matchingMatch.away_club_shortname : matchingMatch.home_club_shortname;
                    return (<td key={`opp-${matchday}`} className="px-3 py-2 text-center text-xs text-gray-500 dark:text-gray-400 w-16">{opponentShortname || '-'}</td>);
                })}
            </tr>

            {/* Ergebnis */}
            <tr>
                <td className="px-3 py-2 text-left text-xs font-medium text-gray-600 dark:text-gray-300 sticky left-0 bg-white dark:bg-gray-800 z-10 w-24">Ergebnis:</td>
                {matchdaysToDisplay.map((matchday) => {
                    const matchingMatch = clubMatches.find(match => match.matchday === matchday);
                    return (<td key={`res-${matchday}`} className="px-3 py-2 text-center text-xs text-gray-500 dark:text-gray-400 w-16">{matchingMatch ? `${matchingMatch.home_score}:${matchingMatch.away_score}` : '-'}</td>);
                })}
            </tr>

            {/* Place */}
            <tr className="bg-gray-50 dark:bg-gray-700/50">
                <td className="px-3 py-2 text-left text-xs font-medium text-gray-600 dark:text-gray-300 sticky left-0 bg-gray-50 dark:bg-gray-700/50 z-10 w-24">Place:</td>
                {matchdaysToDisplay.map((matchday) => {
                    const matchingMatch = clubMatches.find(match => match.matchday === matchday);
                    const isHome = matchingMatch ? String(teamId) === String(matchingMatch.home_club_id) : null;
                    return (<td key={`place-${matchday}`} className="px-3 py-2 text-center text-xs text-gray-500 dark:text-gray-400 w-16">{matchingMatch ? (isHome ? 'H' : 'A') : '-'}</td>);
                })}
            </tr>

            {/* Grafik */}
            <tr className="bg-gray-100 dark:bg-gray-750 border-b border-gray-300 dark:border-gray-600">
                <td className="px-3 py-2 text-left text-xs font-semibold text-gray-700 dark:text-gray-200 sticky left-0 bg-gray-100 dark:bg-gray-750 z-20 align-top w-24">
                    Grafik:
                </td>
                <td colSpan={matchdaysToDisplay.length} className="relative">
                    <svg className="w-full h-80 absolute top-0 left-0 pointer-events-none" style={{ zIndex: 5 }}>
                        <polyline
                            points={matchdaysToDisplay.map((md, index) => {
                                const data = relevantCombinedData.find(d => d.matchday === md);
                                const marketValue = data?.marketValue ?? null;
                                if (marketValue === null) return '';
                                const x = (index *80) + 32; // 64px pro Spalte (16 * 4), +32 für die Mitte
                                const y = 320 - (marketValue / maxMarketValue * 320); // 320px Höhe, von oben nach unten
                                return `${x},${y}`;
                            }).filter(Boolean).join(' ')}
                            fill="none"
                            stroke="rgb(34, 197, 94)" // green-500
                            strokeWidth="2"
                            className="dark:stroke-green-400"
                        />
                        {matchdaysToDisplay.map((md, index) => {
                            const data = relevantCombinedData.find(d => d.matchday === md);
                            const marketValue = data?.marketValue ?? null;
                            if (marketValue === null) return null;
                            const x = (index * 80) + 32;
                            const y = 320 - (marketValue / maxMarketValue * 320);
                            return (
                                <circle
                                    key={`mv-dot-${md}`}
                                    cx={x}
                                    cy={y}
                                    r={4}
                                    fill="rgb(34,197,94)"
                                    className="dark:fill-green-400"
                                />
                            );
                        })}
                    </svg>
                    <div className="grid grid-cols-[repeat(auto-fit,5rem)]">
                        {matchdaysToDisplay.map((md, index) => {
                            const data = relevantCombinedData.find(d => d.matchday === md);
                            let points = data?.points ?? null;
                            
                            // Berechne prognostizierte Punkte für zukünftige Spieltage
                            if (selectedMatchday > 0 && md > selectedMatchday) {
                                points = calculateProjectedPoints(
                                    md,
                                    selectedMatchday,
                                    relevantCombinedData,
                                    playerStats,
                                    clubMatches,
                                    teamId
                                );
                            }
                            
                            const isNegativePoints = points !== null && points < 0;

                            // Berechne die Höhe relativ zum maximalen Wert
                            const pointsHeight = points !== null ? (points / maxPoints * 100) : 0;

                            return (
                                <div key={`viz-${md}`} className="px-1 py-2 text-center align-bottom h-80 relative border-r border-gray-200 dark:border-gray-700 w-16">
                                    <div className="w-full h-full flex flex-col">
                                        <div className="w-full h-full flex justify-center items-end space-x-px relative">
                                            <div className="absolute left-0 right-0 h-px bg-gray-300 dark:bg-gray-600 bottom-0"></div>
                                            
                                            {points !== null && (
                                                <div
                                                    className={`${isNegativePoints ? 'bg-red-500 hover:bg-red-400' : 'bg-blue-500 hover:bg-blue-400'} w-2 relative`}
                                                    style={{
                                                        height: `${pointsHeight}%`,
                                                        position: 'absolute',
                                                        bottom: '0'
                                                    }}
                                                    title={`Punkte: ${points}`}
                                                ></div>
                                            )}
                                        </div>
                                    </div>
                                    <div className="absolute top-0 left-0 right-0 px-1 text-center pointer-events-none">
                                        <div className={`text-xs ${points !== null && points < 0 ? 'text-red-600 dark:text-red-400' : 'text-blue-600 dark:text-blue-400'} whitespace-nowrap`}>
                                            {points ?? '-'}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </td>
            </tr>

            {/* Punkte */}
            <tr>
                <td className="px-3 py-2 text-left text-xs font-medium text-gray-600 dark:text-gray-300 sticky left-0 bg-white dark:bg-gray-800 z-10 w-24">Punkte:</td>
                {matchdaysToDisplay.map((md) => {
                    const data = relevantCombinedData.find(d => d.matchday === md);
                    let calculatedPoints = data?.points ?? null;
                    
                    if (selectedMatchday > 0 && md > selectedMatchday) {
                        calculatedPoints = calculateProjectedPoints(
                            md,
                            selectedMatchday,
                            relevantCombinedData,
                            playerStats,
                            clubMatches,
                            teamId
                        );
                    }

                    let pc = "text-gray-500 dark:text-gray-400"; 
                    if (calculatedPoints !== null && calculatedPoints > 0) pc = "text-green-600 dark:text-green-400 font-medium"; 
                    else if (calculatedPoints !== null && calculatedPoints < 0) pc = "text-red-600 dark:text-red-400 font-medium";
                    return (<td key={`pts-data-${md}`} className={`px-3 py-2 text-center text-xs ${pc} w-16`}>{calculatedPoints ?? '-'}</td>);
                })}
            </tr>

            {/* Marktwert */}
            <tr className="bg-gray-50 dark:bg-gray-700/50">
                <td className="px-3 py-2 text-left text-xs font-medium text-gray-600 dark:text-gray-300 sticky left-0 bg-gray-50 dark:bg-gray-700/50 z-10 w-24">Marktwert:</td>
                {matchdaysToDisplay.map((md) => {
                    const data = relevantCombinedData.find(d => d.matchday === md);
                    const marketValueFormatted = data?.marketValueFormatted ?? null;
                    return (<td key={`mv-data-${md}`} className="px-3 py-2 text-center text-xs text-gray-500 dark:text-gray-400 w-16">{marketValueFormatted ? marketValueFormatted.replace(' €', '€') : '-'}</td>)
                })}
            </tr>

            {/* Diff */}
            <tr>
                <td className="px-3 py-2 text-left text-xs font-medium text-gray-600 dark:text-gray-300 sticky left-0 bg-white dark:bg-gray-800 z-10 w-24">Diff:</td>
                {matchdaysToDisplay.map((matchday) => {
                    const currentData = fullCombinedData.find(d => d.matchday === matchday);
                    const prevData = fullCombinedData.find(d => d.matchday === matchday - 1); // Find in full data

                    const marketValue = currentData?.marketValue ?? null;
                    const prevMarketValue = prevData?.marketValue ?? null;

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
             <tr className="bg-gray-50 dark:bg-gray-700/50">
                <td className="px-3 py-2 text-left text-xs font-medium text-gray-600 dark:text-gray-300 sticky left-0 bg-gray-50 dark:bg-gray-700/50 z-10 w-24">Note:</td>
                {matchdaysToDisplay.map((matchday) => {
                    const s = playerStats.find(stat => stat.matchday === matchday);
                    const n = s?.liga_note;
                    return (
                        <td key={`note-${matchday}`} className="px-3 py-2 text-center text-xs text-gray-500 dark:text-gray-400 w-16">
                            {n !== null && n !== undefined && !isNaN(Number(n)) ? Number(n).toFixed(1) : '-'}
                        </td>
                    );
                })}
            </tr>

            {/* S11 */}
            <tr>
                <td className="px-3 py-2 text-left text-xs font-medium text-gray-600 dark:text-gray-300 sticky left-0 bg-white dark:bg-gray-800 z-10 w-24">S11:</td>
                {matchdaysToDisplay.map((matchday) => { 
                    const s = playerStats.find(stat => stat.matchday === matchday);
                    const forecast = s?.forecast;
                    if (matchday >= 30 && forecast !== null && forecast !== undefined) {
                        let percentage = '-';
                        if (forecast === 1) percentage = '90%';
                        else if (forecast === 2) percentage = '60%';
                        else if (forecast === 3) percentage = '30%';
                        return <td key={`s11-${matchday}`} className="px-3 py-2 text-center text-xs text-gray-500 dark:text-gray-400 w-16">{percentage}</td>;
                    }
                    return <td key={`s11-${matchday}`} className="px-3 py-2 text-center text-xs text-gray-500 dark:text-gray-400 w-16">{s ? (s.started ? '✓' : '✗') : '-'}</td>;
                })}
            </tr>

            {/* Minuten */}
            <tr className="bg-gray-50 dark:bg-gray-700/50">
                <td className="px-3 py-2 text-left text-xs font-medium text-gray-600 dark:text-gray-300 sticky left-0 bg-gray-50 dark:bg-gray-700/50 z-10 w-24">Min:</td>
                {matchdaysToDisplay.map((matchday) => { const s = playerStats.find(stat => stat.matchday === matchday); return <td key={`min-${matchday}`} className="px-3 py-2 text-center text-xs text-gray-500 dark:text-gray-400 w-16">{s ? s.minutes : (s === undefined ? '-' : '0')}</td>; })}
            </tr>

            {/* Status */}
            <tr>
                <td className="px-3 py-2 text-left text-xs font-medium text-gray-600 dark:text-gray-300 sticky left-0 bg-white dark:bg-gray-800 z-10 w-24">Status:</td>
                {matchdaysToDisplay.map((matchday) => {
                    const s = playerStats.find(stat => stat.matchday === matchday);
                    return (<td key={`stat-${matchday}`} className="px-3 py-2 text-center text-xs text-gray-500 dark:text-gray-400 w-16">{s ? (s.status === 1 ? (<span className="text-red-600 dark:text-red-400" title={s.injury_text || 'Verletzt'}>🟥</span>) : s.status === 2 ? (<span className="text-yellow-600 dark:text-yellow-400" title="Fraglich">?</span>) : (<span className="text-green-600 dark:text-green-400" title="Fit">✓</span>)) : '-'}</td>);
                })}
            </tr>
        </>
    );
};

const calculateProjectedPoints = (
    matchday: number,
    selectedMatchday: number,
    relevantCombinedData: MatchdayVizData[],
    playerStats: PlayerStats[],
    clubMatches: ClubMatch[],
    teamId: string
): number | null => {
    if (selectedMatchday <= 0 || matchday <= selectedMatchday) {
        return null;
    }

    // Berechne Ø Punkte aus der Spielerübersicht für den ausgewählten Spieltag
    const selectedMatchdayData = relevantCombinedData
        .filter((d: MatchdayVizData) => d.matchday <= selectedMatchday && d.points !== null)
        .reduce((sum: number, d: MatchdayVizData) => sum + (d.points ?? 0), 0);
    const appearances = playerStats
        .filter(s => s.matchday <= selectedMatchday && s.minutes > 0)
        .length;
    const avgPoints = appearances > 0 ? selectedMatchdayData / appearances : 0;

    // Berechne Ø Matchup Score aus der Spielerübersicht für den ausgewählten Spieltag
    const relevantMatches = clubMatches
        .filter(match => match.matchday <= selectedMatchday)
        .map(match => {
            const isHome = String(teamId) === String(match.home_club_id);
            const homeHeur = match.home_heuristics / 100;
            const awayHeur = match.away_heuristics / 100;
            const drawHeurValue = match.draw_heuristics / 100;
            
            const winProbRaw = isHome ? 1 / homeHeur : 1 / awayHeur;
            const drawProbRaw = 1 / drawHeurValue;
            const lossProbRaw = isHome ? 1 / awayHeur : 1 / homeHeur;
            
            const sumOfReciprocals = winProbRaw + drawProbRaw + lossProbRaw;
            
            const lossProb = lossProbRaw / sumOfReciprocals;
            return 1 - (lossProb * 100) / 100;
        });
    
    const playerAppearances = playerStats
        .filter(s => s.matchday <= selectedMatchday && s.minutes > 0)
        .map(s => s.matchday);
    
    const validMatchupScores = relevantMatches
        .filter((_, index) => playerAppearances.includes(index + 1));
    
    const avgMatchupScore = validMatchupScores.length > 0 
        ? validMatchupScores.reduce((sum: number, score: number) => sum + score, 0) / validMatchupScores.length
        : 0;

    // Finde den Matchup Score für den aktuellen Spieltag
    const currentMatch = clubMatches.find(match => match.matchday === matchday);
    if (!currentMatch) {
        return null;
    }

    const isHome = String(teamId) === String(currentMatch.home_club_id);
    const homeHeur = currentMatch.home_heuristics / 100;
    const awayHeur = currentMatch.away_heuristics / 100;
    const drawHeurValue = currentMatch.draw_heuristics / 100;
    
    const winProbRaw = isHome ? 1 / homeHeur : 1 / awayHeur;
    const drawProbRaw = 1 / drawHeurValue;
    const lossProbRaw = isHome ? 1 / awayHeur : 1 / homeHeur;
    
    const sumOfReciprocals = winProbRaw + drawProbRaw + lossProbRaw;
    
    const lossProb = lossProbRaw / sumOfReciprocals;
    const currentMatchupScore = 1 - (lossProb * 100) / 100;

    // Berechne die prognostizierten Punkte
    return Math.round(avgPoints * (currentMatchupScore / avgMatchupScore));
};

function PlayerInfoContent() {
    const router = useRouter();
    const searchParams = useSearchParams();

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

    const [selectedMatchday, setSelectedMatchday] = useState<number>(0);

    const [playerNews, setPlayerNews] = useState<PlayerNews[]>([]);
    const [newsLoading, setNewsLoading] = useState(false);
    const [newsError, setNewsError] = useState<string | null>(null);

    // Fetching useEffect hooks
    useEffect(() => {
        if (leagueId) {
            const storedLeague = localStorage.getItem('selectedLeague');
            if (storedLeague) {
                try {
                    const selectedLeague = JSON.parse(storedLeague);
                    if (selectedLeague.id === leagueId) {
                        setLeagueImage(selectedLeague.image);
                    }
                } catch (e) { console.error("Error parsing selectedLeague for header:", e); }
            }
        }
    }, [leagueId]);

    useEffect(() => {
         const fetchValueHistory = async () => {
            if (!playerId || playerId === '-') return;
            setIsLoading(true); setError(null);
            try {
                const response = await fetch(`/api/player-values?playerId=${encodeURIComponent(playerId)}`);
                if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
                const data: ValueHistory[] = await response.json();
                setValueHistory(data.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()));
            } catch (e) { setError(e instanceof Error ? e.message : 'Failed to load player values.');
            } finally { setIsLoading(false); }
        };
        fetchValueHistory();
    }, [playerId]);

    useEffect(() => {
         const fetchPlayerStats = async () => {
             if (!playerId || playerId === '-') return;
             setStatsLoading(true); setStatsError(null);
             try {
                 const response = await fetch(`/api/player-stats?playerId=${encodeURIComponent(playerId)}`);
                 if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
                 const data: PlayerStats[] = await response.json();
                 setPlayerStats(data.sort((a, b) => a.matchday - b.matchday));
             } catch (e) { setStatsError(e instanceof Error ? e.message : 'Failed to load player statistics.');
             } finally { setStatsLoading(false); }
         };
        fetchPlayerStats();
    }, [playerId]);

    useEffect(() => {
         const fetchClubMatches = async () => {
             if (!teamId || teamId === '-') return;
             setMatchesLoading(true); setMatchesError(null);
             try {
                 const response = await fetch(`/api/club-matches?clubId=${encodeURIComponent(teamId)}`);
                 if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
                 const data: ClubMatch[] = await response.json();
                 setClubMatches(data.sort((a, b) => a.matchday - b.matchday));
             } catch (e) { setMatchesError(e instanceof Error ? e.message : 'Failed to load club matches.');
             } finally { setMatchesLoading(false); }
         };
        fetchClubMatches();
    }, [teamId]);

    useEffect(() => {
        const fetchPlayerNews = async () => {
            if (!playerId || playerId === '-') return;
            setNewsLoading(true);
            setNewsError(null);
            try {
                const response = await fetch(`/api/player-news?playerId=${encodeURIComponent(playerId)}`);
                if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
                const data: PlayerNews[] = await response.json();
                setPlayerNews(data);
            } catch (e) {
                setNewsError(e instanceof Error ? e.message : 'Fehler beim Laden der Spielernachrichten.');
            } finally {
                setNewsLoading(false);
            }
        };
        fetchPlayerNews();
    }, [playerId]);

    const combinedMatchdayData = useMemo((): MatchdayVizData[] => {
        const combined: MatchdayVizData[] = [];
        const statsMap = new Map(playerStats.map(stat => [stat.matchday, stat]));
        for (let i = 1; i <= 34; i++) {
            const stat = statsMap.get(i);
            const points = stat?.points ?? null;
            const marketValue = findMarketValueForMatchday(i, clubMatches, valueHistory);
            const marketValueFormatted = marketValue !== null ? formatCurrency(marketValue) : null;
            combined.push({ matchday: i, points: points, marketValue: marketValue, marketValueFormatted: marketValueFormatted });
        }
        console.log('Performance-Punkte pro Spieltag:', combined.map(d => ({ matchday: d.matchday, points: d.points })));
        return combined;
    }, [playerStats, clubMatches, valueHistory]);

    const { maxPoints, minPoints } = useMemo(() => {
        const pointsValues = combinedMatchdayData.map(d => d.points).filter((p): p is number => p !== null);
        return {
            maxPoints: pointsValues.length > 0 ? Math.max(0, ...pointsValues) : 0,
            minPoints: pointsValues.length > 0 ? Math.min(0, ...pointsValues) : 0,
        };
    }, [combinedMatchdayData]);

    const maxMarketValue = useMemo(() => {
        const marketValues = combinedMatchdayData.map(d => d.marketValue).filter((mv): mv is number => mv !== null);
        return marketValues.length > 0 ? Math.max(...marketValues) : 0;
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

    const SPLIT_MATCHDAY = 30;
    const totalMatchdays = 34;

    const allMatchdays = useMemo(() => {
        return Array.from({ length: totalMatchdays }, (_, i) => i + 1);
    }, [totalMatchdays]);

    // Funktion zum Ermitteln des Datums eines Spieltags
    const getMatchdayDate = useCallback((matchday: number): Date | null => {
        if (!matchday || matchday <= 0 || !clubMatches.length) return null;
        
        const match = clubMatches.find(m => m.matchday === matchday);
        if (!match || !match.match_date) return null;
        
        return new Date(match.match_date);
    }, [clubMatches]);

    // Filtere die Nachrichten basierend auf dem ausgewählten Spieltag
    const filteredPlayerNews = useMemo(() => {
        if (selectedMatchday <= 0 || !playerNews.length) return playerNews;
        
        const matchdayDate = getMatchdayDate(selectedMatchday);
        if (!matchdayDate) return playerNews;
        
        return playerNews.filter(news => {
            const newsDate = new Date(news.date);
            return newsDate <= matchdayDate;
        });
    }, [playerNews, selectedMatchday, getMatchdayDate]);

    const isLoadingOrError = statsLoading || matchesLoading || isLoading || statsError || matchesError || error;

    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-900 dark:to-gray-800">
            <header className="bg-white dark:bg-gray-850 shadow">
                <div className="max-w-7xl mx-auto py-4 px-4 sm:px-6 lg:px-8 flex justify-between items-center">
                     <div className="flex items-center space-x-3">
                         {leagueId && leagueImage && (
                              <button onClick={() => router.push(`/dashboard?league=${leagueId}`)} title="Zum Liga-Dashboard">
                                 <img src={leagueImage} alt="Liga Logo" className="h-10 w-10 rounded-md object-cover hover:opacity-80 transition-opacity" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                              </button>
                         )}
                         <h1 className="text-xl font-bold text-gray-900 dark:text-white truncate">
                             {firstName !== '-' ? `${firstName} ${lastName}` : lastName}
                         </h1>
                     </div>
                     <div className="flex items-center space-x-4">
                         <select
                             value={selectedMatchday}
                             onChange={(e) => setSelectedMatchday(Number(e.target.value))}
                             className="block w-32 px-3 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                         >
                             <option value={0}>Spieltag wählen</option>
                             {Array.from({ length: 34 }, (_, i) => i + 1).map((md) => (
                                 <option key={md} value={md}>Spieltag {md}</option>
                             ))}
                         </select>
                         <button onClick={handleBack} className="text-sm font-medium text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">
                             Zurück
                         </button>
                     </div>
                 </div>
             </header>

            <main className="max-w-full mx-auto py-6 px-2 sm:px-4 lg:px-6">
                <div className="max-w-4xl mx-auto bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden mb-6">
                     <div className="p-6 flex flex-col md:flex-row items-center space-y-4 md:space-y-0 md:space-x-6">
                        <img src={imageUrl} alt={`${lastName}`} className="h-32 w-32 rounded-full object-cover border-4 border-gray-200 dark:border-gray-700 shadow-md" onError={(e) => { (e.currentTarget as HTMLImageElement).src = '/placeholder.png'; }} />
                        <div className="flex-grow text-center md:text-left">
                            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">{firstName !== '-' ? `${firstName} ${lastName}` : lastName}</h2>
                            <div className="flex items-center justify-center md:justify-start space-x-2 mb-2">
                                {teamData.logo && <img src={`${CDN_BASE_URL}${teamData.logo}`} alt={teamData.name} className="h-6 w-6 object-contain"/>}
                                <span className="text-md text-gray-600 dark:text-gray-400">{teamData.name}</span>
                            </div>
                            <span className={`px-2.5 py-0.5 inline-flex text-sm leading-5 font-semibold rounded-full ${status === 1 ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200' : status === 0 ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'}`}>{getStatusName(status)}</span>
                        </div>
                    </div>
                    <div className="border-t border-gray-200 dark:border-gray-700 px-6 py-5 grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-6">
                        <div><dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Position</dt><dd className="mt-1 text-lg font-semibold text-gray-900 dark:text-white">{getPositionName(position)}</dd></div>
                        <div><dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Marktwert</dt><dd className="mt-1 text-lg font-semibold text-gray-900 dark:text-white flex items-center">{formatCurrency(marketValue)}{mvt !== -1 && (<span className={`ml-2 text-xl font-bold ${trendColor}`}>{trendIcon}</span>)}</dd></div>
                        <div><dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Punkte</dt><dd className="mt-1 text-lg font-semibold text-gray-900 dark:text-white">
                            {selectedMatchday > 0 ? (
                                combinedMatchdayData
                                    .filter(d => d.matchday <= selectedMatchday && d.points !== null)
                                    .reduce((sum, d) => sum + (d.points ?? 0), 0)
                            ) : points}
                        </dd></div>
                        <div><dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Anzahl Einsätze</dt><dd className="mt-1 text-lg font-semibold text-gray-900 dark:text-white">
                            {selectedMatchday > 0 ? (
                                playerStats
                                    .filter(s => s.matchday <= selectedMatchday && s.minutes > 0)
                                    .length
                            ) : playerStats.filter(s => s.minutes > 0).length}
                        </dd></div>
                        <div><dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Ø Punkte</dt><dd className="mt-1 text-lg font-semibold text-gray-900 dark:text-white">
                            {selectedMatchday > 0 ? (
                                (() => {
                                    const totalPoints = combinedMatchdayData
                                        .filter(d => d.matchday <= selectedMatchday && d.points !== null)
                                        .reduce((sum, d) => sum + (d.points ?? 0), 0);
                                    const appearances = playerStats
                                        .filter(s => s.matchday <= selectedMatchday && s.minutes > 0)
                                        .length;
                                    return appearances > 0 ? Math.round(totalPoints / appearances) : '0';
                                })()
                            ) : (
                                (() => {
                                    const totalPoints = combinedMatchdayData
                                        .filter(d => d.points !== null)
                                        .reduce((sum, d) => sum + (d.points ?? 0), 0);
                                    const appearances = playerStats
                                        .filter(s => s.minutes > 0)
                                        .length;
                                    return appearances > 0 ? Math.round(totalPoints / appearances) : '0';
                                })()
                            )}
                        </dd></div>
                        <div><dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Ø Matchup Score</dt><dd className="mt-1 text-lg font-semibold text-gray-900 dark:text-white">
                            {selectedMatchday > 0 ? (
                                (() => {
                                    const relevantMatches = clubMatches
                                        .filter(match => match.matchday <= selectedMatchday)
                                        .map(match => {
                                            const isHome = String(teamId) === String(match.home_club_id);
                                            const homeHeur = match.home_heuristics / 100;
                                            const awayHeur = match.away_heuristics / 100;
                                            const drawHeurValue = match.draw_heuristics / 100;
                                            
                                            const winProbRaw = isHome ? 1 / homeHeur : 1 / awayHeur;
                                            const drawProbRaw = 1 / drawHeurValue;
                                            const lossProbRaw = isHome ? 1 / awayHeur : 1 / homeHeur;
                                            
                                            const sumOfReciprocals = winProbRaw + drawProbRaw + lossProbRaw;
                                            
                                            const lossProb = lossProbRaw / sumOfReciprocals;
                                            return 1 - (lossProb * 100) / 100;
                                        });
                                    
                                    const playerAppearances = playerStats
                                        .filter(s => s.matchday <= selectedMatchday && s.minutes > 0)
                                        .map(s => s.matchday);
                                    
                                    const validMatchupScores = relevantMatches
                                        .filter((_, index) => playerAppearances.includes(index + 1));
                                    
                                    return validMatchupScores.length > 0 
                                        ? (validMatchupScores.reduce((sum, score) => sum + score, 0) / validMatchupScores.length).toFixed(2)
                                        : '0.00';
                                })()
                            ) : (
                                (() => {
                                    const relevantMatches = clubMatches.map(match => {
                                        const isHome = String(teamId) === String(match.home_club_id);
                                        const homeHeur = match.home_heuristics / 100;
                                        const awayHeur = match.away_heuristics / 100;
                                        const drawHeurValue = match.draw_heuristics / 100;
                                        
                                        const winProbRaw = isHome ? 1 / homeHeur : 1 / awayHeur;
                                        const drawProbRaw = 1 / drawHeurValue;
                                        const lossProbRaw = isHome ? 1 / awayHeur : 1 / homeHeur;
                                        
                                        const sumOfReciprocals = winProbRaw + drawProbRaw + lossProbRaw;
                                        
                                        const lossProb = lossProbRaw / sumOfReciprocals;
                                        return 1 - (lossProb * 100) / 100;
                                    });
                                    
                                    const playerAppearances = playerStats
                                        .filter(s => s.minutes > 0)
                                        .map(s => s.matchday);
                                    
                                    const validMatchupScores = relevantMatches
                                        .filter((_, index) => playerAppearances.includes(index + 1));
                                    
                                    return validMatchupScores.length > 0 
                                        ? (validMatchupScores.reduce((sum, score) => sum + score, 0) / validMatchupScores.length).toFixed(2)
                                        : '0.00';
                                })()
                            )}
                        </dd></div>
                        <div><dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Spieler-ID</dt><dd className="mt-1 text-lg font-semibold text-gray-900 dark:text-white">{playerId}</dd></div>
                        <div><dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Verein-ID</dt><dd className="mt-1 text-lg font-semibold text-gray-900 dark:text-white">{teamId}</dd></div>
                    </div>
                 </div>

                {isLoadingOrError && !error && !statsError && !matchesError && <p className="text-gray-600 dark:text-gray-400 text-center py-4 px-6">Lade Daten...</p>}
                {(error || statsError || matchesError) && (
                    <div className="m-4 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative dark:bg-red-900/30 dark:border-red-600 dark:text-red-300">
                        <strong className="font-bold">Fehler!</strong>
                        <span className="block sm:inline"> {statsError || matchesError || error}</span>
                    </div>
                )}
                {!isLoadingOrError && combinedMatchdayData.length === 0 && playerStats.length === 0 && clubMatches.length === 0 && (
                     <p className="text-gray-600 dark:text-gray-400 text-center py-4 px-6">Keine Daten verfügbar.</p>
                )}

                {!isLoadingOrError && (combinedMatchdayData.length > 0 || playerStats.length > 0 || clubMatches.length > 0) && (
                    <>
                        <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
                            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                                <h3 className="text-lg font-medium text-gray-900 dark:text-white">Spielerstatistik</h3>
                            </div>
                            <div className="overflow-x-auto">
                                <div className="w-[1200px] relative">
                                    {selectedMatchday > 0 && (
                                        <div 
                                            className="absolute top-0 bottom-0 w-0.5 bg-red-500 dark:bg-red-400 z-30"
                                            style={{ 
                                                left: `${96 + selectedMatchday * 80}px`,
                                                height: '100%'
                                            }}
                                        />
                                    )}
                                    <table className="divide-y divide-gray-200 dark:divide-gray-700 w-full table-fixed">
                                        <thead className="bg-gray-50 dark:bg-gray-700">
                                            <tr>
                                                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider w-24 sticky left-0 bg-gray-50 dark:bg-gray-700 z-20">MD:</th>
                                                {allMatchdays.map((matchday) => (
                                                    <th key={`head-${matchday}`} scope="col" className="px-3 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider w-20">{matchday}</th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                                            <RenderTableBodyRows
                                                matchdaysToDisplay={allMatchdays}
                                                relevantCombinedData={combinedMatchdayData}
                                                fullCombinedData={combinedMatchdayData}
                                                playerStats={playerStats}
                                                clubMatches={clubMatches}
                                                teamId={teamId ?? ''}
                                                maxPoints={maxPoints}
                                                minPoints={minPoints}
                                                maxMarketValue={maxMarketValue}
                                                selectedMatchday={selectedMatchday}
                                            />
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>

                        {/* Spielernachrichten Widget */}
                        <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
                            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                                <h3 className="text-lg font-medium text-gray-900 dark:text-white">Spielernachrichten</h3>
                            </div>
                            <div className="overflow-x-auto">
                                {newsLoading && <p className="text-gray-600 dark:text-gray-400 text-center py-4">Lade Nachrichten...</p>}
                                {newsError && (
                                    <div className="m-4 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative dark:bg-red-900/30 dark:border-red-600 dark:text-red-300">
                                        <strong className="font-bold">Fehler!</strong>
                                        <span className="block sm:inline"> {newsError}</span>
                                    </div>
                                )}
                                {!newsLoading && !newsError && playerNews.length === 0 && (
                                    <p className="text-gray-600 dark:text-gray-400 text-center py-4">Keine Nachrichten verfügbar.</p>
                                )}
                                {!newsLoading && !newsError && playerNews.length > 0 && (
                                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                                        <thead className="bg-gray-50 dark:bg-gray-700">
                                            <tr>
                                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Datum</th>
                                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Zeit</th>
                                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Titel</th>
                                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Zusammenfassung</th>
                                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Kategorie</th>
                                            </tr>
                                        </thead>
                                        <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                                            {filteredPlayerNews.length > 0 ? (
                                                filteredPlayerNews.map((news, index) => (
                                                    <tr key={index} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                                            {new Date(news.date).toLocaleDateString('de-DE')}
                                                        </td>
                                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                                            {news.time}
                                                        </td>
                                                        <td className="px-6 py-4 text-sm text-gray-900 dark:text-white">
                                                            <a href={news.link} target="_blank" rel="noopener noreferrer" className="hover:text-blue-600 dark:hover:text-blue-400">
                                                                {news.title}
                                                            </a>
                                                        </td>
                                                        <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                                                            {news.comprehension}
                                                        </td>
                                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                                            {news.category}
                                                        </td>
                                                    </tr>
                                                ))
                                            ) : (
                                                <tr>
                                                    <td colSpan={5} className="px-6 py-4 text-center text-sm text-gray-500 dark:text-gray-400">
                                                        Keine Nachrichten für den ausgewählten Zeitraum verfügbar.
                                                    </td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                )}
                            </div>
                        </div>
                    </>
                )}
            </main>
        </div>
    );
}

export default function PlayerPage() {
    return (
        <Suspense fallback={<div className="p-6 text-center">Spielerdetails werden geladen...</div>}>
            <PlayerInfoContent />
        </Suspense>
    );
}