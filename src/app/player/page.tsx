'use client';

import { Suspense, useState, useEffect, useMemo } from 'react';
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
    maxMarketValue
}) => {
    return (
        <>
            {/* Datum */}
            <tr className="bg-gray-50 dark:bg-gray-700/50">
                <td className="px-3 py-2 text-left text-xs font-medium text-gray-600 dark:text-gray-300 sticky left-0 bg-gray-50 dark:bg-gray-700/50 z-10 w-24">Datum:</td>
                {matchdaysToDisplay.map((matchday) => {
                    const matchingMatch = clubMatches.find(match => match.matchday === matchday);
                    const formattedDate = matchingMatch?.match_date ? new Date(matchingMatch.match_date).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }) : '-';
                    return (<td key={`date-${matchday}`} className="px-3 py-2 text-center text-xs text-gray-500 dark:text-gray-400 w-16">{formattedDate}</td>);
                })}
            </tr>

            {/* W/D/L */}
            <tr>
                <td className="px-3 py-2 text-left text-xs font-medium text-gray-600 dark:text-gray-300 sticky left-0 bg-white dark:bg-gray-800 z-10 w-24">W/D/L-P:</td>
                {matchdaysToDisplay.map((matchday) => {
                    const matchingMatch = clubMatches.find(match => match.matchday === matchday);
                    if (!matchingMatch) return <td key={`wdl-${matchday}`} className="px-3 py-2 text-center text-xs text-gray-500 dark:text-gray-400 w-16">-</td>;
                    
                    const isHome = String(teamId) === String(matchingMatch.home_club_id);
                    let result = 'D'; const hs = matchingMatch.home_score; const as = matchingMatch.away_score; if (hs > as) { result = isHome ? 'W' : 'L'; } else if (hs < as) { result = isHome ? 'L' : 'W'; }
                    let rc = "text-yellow-500 dark:text-yellow-400 font-medium"; if (result === 'W') { rc = "text-green-600 dark:text-green-400 font-bold"; } else if (result === 'L') { rc = "text-red-600 dark:text-red-400 font-medium"; }

                    // Berechne Wahrscheinlichkeiten für zukünftige Spiele
                    if (matchingMatch.matchday >= 30) {
                        const homeProb = matchingMatch.home_probabilities / 100;
                        const awayProb = matchingMatch.away_probabilities / 100;
                        const drawProbValue = matchingMatch.draw_probabilities / 100;
                        
                        const winProbRaw = isHome ? 1 / homeProb : 1 / awayProb;
                        const drawProbRaw = 1 / drawProbValue;
                        const lossProbRaw = isHome ? 1 / awayProb : 1 / homeProb;
                        
                        const sumOfReciprocals = winProbRaw + drawProbRaw + lossProbRaw;
                        
                        const winProb = winProbRaw / sumOfReciprocals;
                        const drawProbNorm = drawProbRaw / sumOfReciprocals;
                        const lossProb = lossProbRaw / sumOfReciprocals;

                        return (
                            <td key={`wdl-${matchday}`} className="px-3 py-2 text-center text-xs text-gray-500 dark:text-gray-400 w-16">
                                <div className="flex flex-col space-y-1">
                                    <span className="text-green-600 dark:text-green-400">W: {(winProb * 100).toFixed(0)}%</span>
                                    <span className="text-yellow-600 dark:text-yellow-400">D: {(drawProbNorm * 100).toFixed(0)}%</span>
                                    <span className="text-red-600 dark:text-red-400">L: {(lossProb * 100).toFixed(0)}%</span>
                                </div>
                            </td>
                        );
                    }

                    return <td key={`wdl-${matchday}`} className={`px-3 py-2 text-center text-xs ${rc} w-16`}>{result}</td>;
                })}
            </tr>

            {/* W/D/L-W */}
            <tr>
                <td className="px-3 py-2 text-left text-xs font-medium text-gray-600 dark:text-gray-300 sticky left-0 bg-white dark:bg-gray-800 z-10 w-24">W/D/L-W:</td>
                {matchdaysToDisplay.map((matchday) => {
                    const matchingMatch = clubMatches.find(match => match.matchday === matchday);
                    if (!matchingMatch) return <td key={`wdlw-${matchday}`} className="px-3 py-2 text-center text-xs text-gray-500 dark:text-gray-400 w-16">-</td>;
                    
                    const isHome = String(teamId) === String(matchingMatch.home_club_id);
                    let result = 'D'; const hs = matchingMatch.home_score; const as = matchingMatch.away_score; if (hs > as) { result = isHome ? 'W' : 'L'; } else if (hs < as) { result = isHome ? 'L' : 'W'; }
                    let rc = "text-yellow-500 dark:text-yellow-400 font-medium"; if (result === 'W') { rc = "text-green-600 dark:text-green-400 font-bold"; } else if (result === 'L') { rc = "text-red-600 dark:text-red-400 font-medium"; }

                    // Berechne Wahrscheinlichkeiten für zukünftige Spiele mit Heuristik-Werten
                    if (matchingMatch.matchday >= 30) {
                        const homeHeur = matchingMatch.home_heuristics / 100;
                        const awayHeur = matchingMatch.away_heuristics / 100;
                        const drawHeurValue = matchingMatch.draw_heuristics / 100;
                        
                        const winProbRaw = isHome ? 1 / homeHeur : 1 / awayHeur;
                        const drawProbRaw = 1 / drawHeurValue;
                        const lossProbRaw = isHome ? 1 / awayHeur : 1 / homeHeur;
                        
                        const sumOfReciprocals = winProbRaw + drawProbRaw + lossProbRaw;
                        
                        const winProb = winProbRaw / sumOfReciprocals;
                        const drawProbNorm = drawProbRaw / sumOfReciprocals;
                        const lossProb = lossProbRaw / sumOfReciprocals;

                        return (
                            <td key={`wdlw-${matchday}`} className="px-3 py-2 text-center text-xs text-gray-500 dark:text-gray-400 w-16">
                                <div className="flex flex-col space-y-1">
                                    <span className="text-green-600 dark:text-green-400">W: {(winProb * 100).toFixed(0)}%</span>
                                    <span className="text-yellow-600 dark:text-yellow-400">D: {(drawProbNorm * 100).toFixed(0)}%</span>
                                    <span className="text-red-600 dark:text-red-400">L: {(lossProb * 100).toFixed(0)}%</span>
                                </div>
                            </td>
                        );
                    }

                    return <td key={`wdlw-${matchday}`} className={`px-3 py-2 text-center text-xs ${rc} w-16`}>{result}</td>;
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
                {/* Y-Achse mit Beschriftung - nur einmal auf der linken Seite */}
                <td className="px-1 py-2 text-center align-bottom h-80 relative border-r border-gray-200 dark:border-gray-700 w-12 sticky left-24 bg-gray-100 dark:bg-gray-750 z-10">
                    <div className="w-full h-full flex flex-col">
                        <div className="absolute left-0 top-0 bottom-0 w-full flex flex-col justify-between text-[10px] text-gray-500 dark:text-gray-400">
                            <div className="flex items-center">
                                <div className="w-6 h-px bg-gray-300 dark:bg-gray-600"></div>
                                <span className="ml-1 font-medium">{maxPoints}</span>
                            </div>
                            <div className="flex items-center">
                                <div className="w-6 h-px bg-gray-300 dark:bg-gray-600"></div>
                                <span className="ml-1 font-medium">{Math.round(maxPoints * 0.75)}</span>
                            </div>
                            <div className="flex items-center">
                                <div className="w-6 h-px bg-gray-300 dark:bg-gray-600"></div>
                                <span className="ml-1 font-medium">{Math.round(maxPoints * 0.5)}</span>
                            </div>
                            <div className="flex items-center">
                                <div className="w-6 h-px bg-gray-300 dark:bg-gray-600"></div>
                                <span className="ml-1 font-medium">{Math.round(maxPoints * 0.25)}</span>
                            </div>
                            <div className="flex items-center">
                                <div className="w-6 h-px bg-gray-300 dark:bg-gray-600"></div>
                                <span className="ml-1 font-medium">0</span>
                            </div>
                        </div>
                    </div>
                </td>
                <td colSpan={matchdaysToDisplay.length} className="relative">
                    <svg className="w-full h-80 absolute top-0 left-0 pointer-events-none" style={{ zIndex: 5 }}>
                        <polyline
                            points={matchdaysToDisplay.map((md, index) => {
                                const data = relevantCombinedData.find(d => d.matchday === md);
                                const marketValue = data?.marketValue ?? null;
                                if (marketValue === null) return '';
                                const x = (index * 64) + 32; // 64px pro Spalte (16 * 4), +32 für die Mitte
                                const y = 320 - (marketValue / maxMarketValue * 320); // 320px Höhe, von oben nach unten
                                return `${x},${y}`;
                            }).filter(Boolean).join(' ')}
                            fill="none"
                            stroke="rgb(34, 197, 94)" // green-500
                            strokeWidth="2"
                            className="dark:stroke-green-400"
                        />
                    </svg>
                    <div className="grid grid-cols-[repeat(auto-fit,4rem)]">
                        {matchdaysToDisplay.map((md, index) => {
                    const data = relevantCombinedData.find(d => d.matchday === md);
                    const points = data?.points ?? null;
                    const marketValue = data?.marketValue ?? null;
                    const isNegativePoints = points !== null && points < 0;

                            // Berechne die Höhe relativ zum maximalen Wert
                            const pointsHeight = points !== null ? (points / maxPoints * 100) : 0;
                            const mvHeight = marketValue !== null ? (marketValue / maxMarketValue * 100) : 0;

                    return (
                                <div key={`viz-${md}`} className="px-1 py-2 text-center align-bottom h-80 relative border-r border-gray-200 dark:border-gray-700 w-16">
                                    <div className="w-full h-full flex flex-col">
                                        {/* Balken-Container */}
                                        <div className="w-full h-full flex justify-center items-end space-x-px relative">
                                            {/* X-Achse */}
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

                                            {/* Marktwert-Punkt */}
                                            {marketValue !== null && (
                                                <div
                                                    className="absolute w-2 h-2 bg-green-500 rounded-full"
                                                    style={{
                                                        bottom: `${mvHeight}%`,
                                                        left: '50%',
                                                        transform: 'translateX(-50%)'
                                                    }}
                                                    title={`Marktwert: ${formatCurrency(marketValue)}`}
                                                />
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
                    const points = data?.points ?? null;
                    let pc = "text-gray-500 dark:text-gray-400"; if (points !== null && points > 0) pc = "text-green-600 dark:text-green-400 font-medium"; else if (points !== null && points < 0) pc = "text-red-600 dark:text-red-400 font-medium";
                    return (<td key={`pts-data-${md}`} className={`px-3 py-2 text-center text-xs ${pc} w-16`}>{points ?? '-'}</td>);
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
             <tr className="bg-gray-50 dark:bg-gray-700/50"> {/* Note was on white, made it gray for consistency */}
                <td className="px-3 py-2 text-left text-xs font-medium text-gray-600 dark:text-gray-300 sticky left-0 bg-gray-50 dark:bg-gray-700/50 z-10 w-24">Note:</td>
                {matchdaysToDisplay.map((matchday) => { const s = playerStats.find(stat => stat.matchday === matchday); const n = s?.liga_note; return <td key={`note-${matchday}`} className="px-3 py-2 text-center text-xs text-gray-500 dark:text-gray-400 w-16">{n !== null && n !== undefined && !isNaN(Number(n)) ? Number(n).toFixed(1) : '-'}</td>; })}
            </tr>

            {/* S11 */}
            <tr> {/* S11 was on gray, made it white */}
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
            <tr className="bg-gray-50 dark:bg-gray-700/50"> {/* Minuten was on white, made it gray */}
                <td className="px-3 py-2 text-left text-xs font-medium text-gray-600 dark:text-gray-300 sticky left-0 bg-gray-50 dark:bg-gray-700/50 z-10 w-24">Min:</td>
                {matchdaysToDisplay.map((matchday) => { const s = playerStats.find(stat => stat.matchday === matchday); return <td key={`min-${matchday}`} className="px-3 py-2 text-center text-xs text-gray-500 dark:text-gray-400 w-16">{s ? s.minutes : (s === undefined ? '-' : '0')}</td>; })}
            </tr>

            {/* Status */}
            <tr> {/* Status was on gray, made it white */}
                <td className="px-3 py-2 text-left text-xs font-medium text-gray-600 dark:text-gray-300 sticky left-0 bg-white dark:bg-gray-800 z-10 w-24">Status:</td>
                {matchdaysToDisplay.map((matchday) => {
                    const s = playerStats.find(stat => stat.matchday === matchday);
                    return (<td key={`stat-${matchday}`} className="px-3 py-2 text-center text-xs text-gray-500 dark:text-gray-400 w-16">{s ? (s.status === 1 ? (<span className="text-red-600 dark:text-red-400" title={s.injury_text || 'Verletzt'}>⚕</span>) : s.status === 2 ? (<span className="text-yellow-600 dark:text-yellow-400" title="Fraglich">?</span>) : (<span className="text-green-600 dark:text-green-400" title="Fit">✓</span>)) : '-'}</td>);
                })}
            </tr>

            {/* Tore */}
            <tr className="bg-gray-50 dark:bg-gray-700/50">
                <td className="px-3 py-2 text-left text-xs font-medium text-gray-600 dark:text-gray-300 sticky left-0 bg-gray-50 dark:bg-gray-700/50 z-10 w-24">Tore:</td>
                {matchdaysToDisplay.map((matchday) => { const s = playerStats.find(stat => stat.matchday === matchday); return <td key={`goals-${matchday}`} className="px-3 py-2 text-center text-xs text-gray-500 dark:text-gray-400 w-16">{s && s.goals > 0 ? s.goals : '-'}</td>; })}
            </tr>

            {/* Assists */}
            <tr>
                <td className="px-3 py-2 text-left text-xs font-medium text-gray-600 dark:text-gray-300 sticky left-0 bg-white dark:bg-gray-800 z-10 w-24">Assists:</td>
                {matchdaysToDisplay.map((matchday) => { const s = playerStats.find(stat => stat.matchday === matchday); return <td key={`assist-${matchday}`} className="px-3 py-2 text-center text-xs text-gray-500 dark:text-gray-400 w-16">{s && s.assist > 0 ? s.assist : '-'}</td>; })}
            </tr>

            {/* Gelb */}
            <tr className="bg-gray-50 dark:bg-gray-700/50">
                <td className="px-3 py-2 text-left text-xs font-medium text-gray-600 dark:text-gray-300 sticky left-0 bg-gray-50 dark:bg-gray-700/50 z-10 w-24">Gelb:</td>
                {matchdaysToDisplay.map((matchday) => { const s = playerStats.find(stat => stat.matchday === matchday); return (<td key={`yellow-${matchday}`} className="px-3 py-2 text-center text-xs text-gray-500 dark:text-gray-400 w-16">{s && s.yellow > 0 ? (<span className="inline-flex items-center justify-center w-4 h-4 bg-yellow-400 rounded-sm text-[10px] text-gray-900">{s.yellow}</span>) : '-'}</td>); })}
            </tr>

            {/* Rot */}
            <tr>
                <td className="px-3 py-2 text-left text-xs font-medium text-gray-600 dark:text-gray-300 sticky left-0 bg-white dark:bg-gray-800 z-10 w-24">Rot:</td>
                {matchdaysToDisplay.map((matchday) => { const s = playerStats.find(stat => stat.matchday === matchday); return (<td key={`red-${matchday}`} className="px-3 py-2 text-center text-xs text-gray-500 dark:text-gray-400 w-16">{s && s.red > 0 ? (<span className="inline-flex items-center justify-center w-4 h-4 bg-red-600 rounded-sm text-[10px] text-white">{s.red}</span>) : '-'}</td>); })}
            </tr>
        </>
    );
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

    const analysisMatchdays = useMemo(() => Array.from({ length: SPLIT_MATCHDAY - 1 }, (_, i) => i + 1), [SPLIT_MATCHDAY]);
    const prognosisMatchdays = useMemo(() => Array.from({ length: totalMatchdays - SPLIT_MATCHDAY + 1 }, (_, i) => SPLIT_MATCHDAY + i), [SPLIT_MATCHDAY, totalMatchdays]);

    const analysisCombinedData = useMemo(() => combinedMatchdayData.filter(d => d.matchday < SPLIT_MATCHDAY), [combinedMatchdayData, SPLIT_MATCHDAY]);
    const prognosisCombinedData = useMemo(() => combinedMatchdayData.filter(d => d.matchday >= SPLIT_MATCHDAY), [combinedMatchdayData, SPLIT_MATCHDAY]);
    
    const commonTableBodyProps = {
        fullCombinedData: combinedMatchdayData,
        playerStats,
        clubMatches,
        teamId: teamId ?? '',
        maxPoints,
        minPoints,
        maxMarketValue
    };

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
                     <button onClick={handleBack} className="text-sm font-medium text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">
                         Zurück
                     </button>
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
                        <div><dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Punkte</dt><dd className="mt-1 text-lg font-semibold text-gray-900 dark:text-white">{points}</dd></div>
                        <div><dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Ø Punkte</dt><dd className="mt-1 text-lg font-semibold text-gray-900 dark:text-white">{avgPoints}</dd></div>
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
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Player Analysis Section (MD 1 to SPLIT_MATCHDAY - 1) */}
                        <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
                            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                                <h3 className="text-lg font-medium text-gray-900 dark:text-white">Spieleranalyse</h3>
                            </div>
                            <div className="overflow-x-auto">
                                <div className="w-[600px]">
                                    <table className="divide-y divide-gray-200 dark:divide-gray-700 w-full">
                                        <thead className="bg-gray-50 dark:bg-gray-700">
                                            <tr>
                                                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider w-24 sticky left-0 bg-gray-50 dark:bg-gray-700 z-20">MD:</th>
                                                {analysisMatchdays.map((matchday) => (
                                                    <th key={`head-an-${matchday}`} scope="col" className="px-3 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider w-16">{matchday}</th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                                            <RenderTableBodyRows
                                                matchdaysToDisplay={analysisMatchdays}
                                                relevantCombinedData={analysisCombinedData}
                                                {...commonTableBodyProps}
                                            />
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>

                        {/* Player Prognosis Section (MD SPLIT_MATCHDAY to 34) */}
                        {prognosisMatchdays.length > 0 && (
                            <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
                                <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                                    <h3 className="text-lg font-medium text-gray-900 dark:text-white">Spielerprognose</h3>
                                </div>
                                <div className="overflow-x-auto">
                                    <div className="w-[600px]">
                                        <table className="divide-y divide-gray-200 dark:divide-gray-700 w-full">
                                            <thead className="bg-gray-50 dark:bg-gray-700">
                                                <tr>
                                                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider w-24 sticky left-0 bg-gray-50 dark:bg-gray-700 z-20">MD:</th>
                                                    {prognosisMatchdays.map((matchday) => (
                                                        <th key={`head-pr-${matchday}`} scope="col" className="px-3 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider w-16">{matchday}</th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                                                <RenderTableBodyRows
                                                    matchdaysToDisplay={prognosisMatchdays}
                                                    relevantCombinedData={prognosisCombinedData}
                                                    {...commonTableBodyProps}
                                                />
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
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