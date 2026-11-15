/**
 * Natural Organism Designer
 * Evolves candidate anatomies against a user-defined ecological pressure.
 * Output uses the same core anatomy/state shape as Life Engine organism serialization.
 */
const TYPES = ['mouth', 'producer', 'mover', 'killer', 'armor', 'eye'];
const DECISIONS = { neutral: 0, retreat: 1, chase: 2 };

class NaturalOrganismDesigner {
    static design(options = {}) {
        const settings = {
            objective: options.objective || 'balanced',
            food: clamp(Number(options.food ?? 55), 0, 100),
            danger: clamp(Number(options.danger ?? 25), 0, 100),
            mobility: clamp(Number(options.mobility ?? 50), 0, 100),
            generations: clamp(Math.round(Number(options.generations ?? 80)), 10, 300),
            population: clamp(Math.round(Number(options.population ?? 36)), 12, 100),
            maxCells: clamp(Math.round(Number(options.maxCells ?? 12)), 3, 30),
            seed: Number.isFinite(Number(options.seed)) ? Number(options.seed) >>> 0 : 20261114
        };
        const rng = random(settings.seed);
        let population = Array.from({ length: settings.population }, () => randomGenome(settings.maxCells, rng));
        let best = null;
        let bestScore = -Infinity;
        const history = [];

        for (let generation = 0; generation < settings.generations; generation++) {
            const ranked = population.map(genome => ({
                genome,
                score: evaluate(genome, settings)
            })).sort((a, b) => b.score - a.score);

            if (ranked[0].score > bestScore) {
                bestScore = ranked[0].score;
                best = clone(ranked[0].genome);
            }
            history.push({ generation: generation + 1, best: round(ranked[0].score, 3), mean: round(ranked.reduce((s, x) => s + x.score, 0) / ranked.length, 3) });

            const eliteCount = Math.max(2, Math.floor(settings.population * 0.18));
            const next = ranked.slice(0, eliteCount).map(x => clone(x.genome));
            while (next.length < settings.population) {
                const parent = tournament(ranked, rng).genome;
                const child = mutate(clone(parent), settings.maxCells, rng);
                if (rng() < 0.24) {
                    const mate = tournament(ranked, rng).genome;
                    child.cells = crossover(child.cells, mate.cells, settings.maxCells, rng);
                }
                next.push(child);
            }
            population = next;
        }

        const organism = toLifeEngineOrganism(best, settings, bestScore);
        return { organism, report: { algorithm: 'Life Engine ecological evolutionary search', generations: settings.generations, population: settings.population, bestFitness: round(bestScore, 3), history } };
    }
}

function evaluate(g, s) {
    const count = g.cells.length;
    const n = type => g.cells.filter(c => c.type === type).length;
    const mouths = n('mouth'), producers = n('producer'), movers = n('mover');
    const killers = n('killer'), armor = n('armor'), eyes = n('eye');
    const mobility = s.mobility / 100, danger = s.danger / 100, food = s.food / 100;
    const hasMover = movers > 0, hasEyes = eyes > 0;
    const feeding = mouths * (0.55 + food * 0.9) + producers * (0.25 + (1 - food) * 0.9);
    const movement = hasMover ? (0.7 + mobility * 1.5) : (0.45 + (1 - mobility) * 0.35);
    const sensing = hasMover && hasEyes ? 1 + 0.75 * (danger + food) : 1;
    const defense = killers * danger * 0.85 + armor * danger * 0.7;
    const energyCost = count * 0.12 + movers * 0.18 + eyes * 0.1 + killers * 0.14 + armor * 0.1;
    const efficiency = (feeding * movement * sensing + defense) / (1 + energyCost);
    const specialization = s.objective === 'survivor'
        ? (movement * 0.55 + defense * 0.8 + feeding * 0.45)
        : s.objective === 'colonizer'
        ? (feeding * 1.0 + movement * 0.65 + producers * 0.12)
        : s.objective === 'predator'
        ? (killers * (0.5 + danger) + movement * 0.65 + armor * danger * 0.3 + mouths * 0.3)
        : (feeding * 0.75 + movement * 0.65 + defense * 0.5);
    const functionalBonus = (mouths > 0 ? 0.6 : -2.5) + (producers > 0 ? 0.35 : 0) +
        (hasMover ? 0.25 : 0) + (hasMover && hasEyes ? 0.55 : 0) +
        (danger > 0.35 && (killers + armor) > 0 ? 0.5 : 0);
    const shapePenalty = disconnectedPenalty(g.cells);
    const overgrowthPenalty = Math.max(0, count - 8) * 0.16;
    return specialization * 0.72 + efficiency * 0.65 + functionalBonus - shapePenalty - overgrowthPenalty;
}

function randomGenome(max, rng) {
    const cells = [{ x: 0, y: 0, type: 'mouth' }];
    const target = 3 + Math.floor(rng() * Math.max(1, max - 2));
    while (cells.length < target) addRandomCell(cells, rng);
    return { cells, moveRange: 2 + Math.floor(rng() * 6), mutability: 2 + Math.floor(rng() * 10) };
}
function addRandomCell(cells, rng) {
    const occupied = new Set(cells.map(c => c.x + ',' + c.y));
    const frontier = [];
    for (const c of cells) for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const x = c.x + dx, y = c.y + dy;
        if (!occupied.has(x + ',' + y) && Math.abs(x) <= 5 && Math.abs(y) <= 5) frontier.push({ x, y });
    }
    if (!frontier.length) return;
    const p = frontier[Math.floor(rng() * frontier.length)];
    cells.push({ ...p, type: TYPES[Math.floor(rng() * TYPES.length)] });
}
function mutate(g, max, rng) {
    const roll = rng();
    if (roll < 0.38 && g.cells.length < max) addRandomCell(g.cells, rng);
    else if (roll < 0.68 && g.cells.length > 1) g.cells.splice(1 + Math.floor(rng() * (g.cells.length - 1)), 1);
    else if (roll < 0.9) g.cells[Math.floor(rng() * g.cells.length)].type = TYPES[Math.floor(rng() * TYPES.length)];
    else g.moveRange = clamp(g.moveRange + (rng() < 0.5 ? -1 : 1), 1, 12);
    if (!g.cells.some(c => c.type === 'mouth')) g.cells[0].type = 'mouth';
    return g;
}
function crossover(a, b, max, rng) {
    const merged = a.slice(0, Math.max(1, Math.floor(a.length / 2)));
    for (const c of b) {
        if (merged.length >= max) break;
        if (!merged.some(x => x.x === c.x && x.y === c.y) && rng() < 0.55) merged.push({ ...c });
    }
    return merged;
}
function tournament(ranked, rng) {
    let winner = ranked[Math.floor(rng() * ranked.length)];
    for (let i = 0; i < 3; i++) {
        const candidate = ranked[Math.floor(rng() * ranked.length)];
        if (candidate.score > winner.score) winner = candidate;
    }
    return winner;
}
function disconnectedPenalty(cells) {
    const seen = new Set(['0,0']), queue = [{ x: 0, y: 0 }];
    while (queue.length) {
        const p = queue.pop();
        for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
            const key = (p.x + dx) + ',' + (p.y + dy);
            if (!seen.has(key) && cells.some(c => c.x === p.x + dx && c.y === p.y + dy)) {
                seen.add(key); queue.push({ x: p.x + dx, y: p.y + dy });
            }
        }
    }
    return (cells.length - seen.size) * 0.35;
}
function toLifeEngineOrganism(g, s, fitness) {
    const decisions = { empty: 0, food: 2, wall: 0, mouth: 0, producer: 0, mover: 0, killer: 1, armor: 0, eye: 0 };
    const hasEyes = g.cells.some(c => c.type === 'eye');
    if (hasEyes) { decisions.food = 2; decisions.killer = 1; }
    const cells = g.cells.map(c => ({
        loc_col: c.x, loc_row: c.y, state: { name: c.type }
    }));
    return {
        format: 'life-engine-organism',
        version: 1,
        name: organismName(g, s),
        c: 0, r: 0, lifetime: 0, food_collected: 0, living: true,
        direction: 1, rotation: 0, can_rotate: true, move_count: 0,
        move_range: g.moveRange, ignore_brain_for: 0,
        mutability: g.mutability, damage: 0,
        anatomy: {
            birth_distance: Math.max(4, ...cells.map(c => Math.max(Math.abs(c.loc_col) * 2 + 2, Math.abs(c.loc_row) * 2 + 2))),
            cells
        },
        brain: { decisions },
        design: {
            generated_by: 'Natural Organism Designer',
            objective: s.objective,
            ecological_conditions: { food_abundance: s.food, danger: s.danger, mobility_pressure: s.mobility },
            fitness_score: round(fitness, 3),
            seed: s.seed
        }
    };
}
function organismName(g, s) {
    const types = g.cells.map(c => c.type);
    const prefix = types.includes('eye') && types.includes('mover') ? 'Scout' :
        types.includes('producer') ? 'Grazing' : types.includes('killer') ? 'Hunter' : 'Forager';
    return prefix + '-' + Math.abs(s.seed).toString(36).slice(-4).toUpperCase();
}
function random(seed) {
    let a = seed || 1;
    return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function clamp(v, min, max) { return Math.max(min, Math.min(max, Number.isFinite(v) ? v : min)); }
function round(v, digits) { const p = Math.pow(10, digits); return Math.round(v * p) / p; }

module.exports = NaturalOrganismDesigner;
