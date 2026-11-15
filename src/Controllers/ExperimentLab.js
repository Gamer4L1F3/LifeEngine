const Hyperparams = require("../Hyperparameters");
const WorldConfig = require("../WorldConfig");
const FossilRecord = require("../Stats/FossilRecord");

class ExperimentLab {
    constructor(controlPanel) {
        this.controlPanel = controlPanel;
        this.engine = controlPanel.engine;
        this.env = this.engine.env;
        this.baseline = null;
        this.active = false;
        this.results = [[], []];
        this.conditionIndex = 0;
        this.replicateIndex = 0;
        this.defineControls();
    }

    defineControls() {
        $("#experiment-capture").on("click", () => this.captureBaseline());
        $("#experiment-run").on("click", () => this.startComparison());
        $("#experiment-cancel").on("click", () => this.cancelComparison());
        $("#experiment-restore").on("click", () => this.restoreBaseline());
    }

    captureBaseline() {
        if (this.active) return;
        const wasRunning = this.engine.running;
        if (wasRunning) this.controlPanel.setPaused(true);
        try {
            this.baseline = JSON.parse(JSON.stringify(this.env.serialize()));
            $("#experiment-baseline-status").text(
                "Starting ecosystem captured · " + this.baseline.organisms.length +
                " organisms · tick " + this.baseline.total_ticks
            );
            $("#experiment-run").prop("disabled", false);
        } catch (error) {
            console.error("Could not capture experiment baseline:", error);
            $("#experiment-baseline-status").text("Could not capture this world. See the browser console.");
        }
        if (wasRunning) this.controlPanel.setPaused(false);
    }

    readCondition(prefix, label) {
        const number = id => {
            const value = Number($("#" + prefix + "-" + id).val());
            return Number.isFinite(value) ? value : 0;
        };
        return {
            label,
            // The simulation stores automatic food drop probability as 0–1.
            foodDropProb: Math.max(0, Math.min(100, number("food-drop"))) / 100,
            foodProdProb: Math.max(0, Math.min(100, number("food-production"))),
            globalMutability: Math.max(0, Math.min(100, number("mutation"))),
            lifespanMultiplier: Math.max(1, number("lifespan")),
            useGlobalMutability: true
        };
    }

    startComparison() {
        if (!this.baseline) {
            $("#experiment-baseline-status").text("Capture a starting ecosystem before running an experiment.");
            return;
        }
        if (this.active) return;

        this.conditions = [
            this.readCondition("experiment-a", "Condition A"),
            this.readCondition("experiment-b", "Condition B")
        ];
        this.duration = Math.max(100, Math.floor(Number($("#experiment-duration").val()) || 1000));
        this.repeats = Math.max(1, Math.min(20, Math.floor(Number($("#experiment-repeats").val()) || 3)));
        const seedValue = Number($("#experiment-seed").val());
        this.baseSeed = Number.isFinite(seedValue) ? (Math.floor(seedValue) >>> 0) : 2026;
        this.originalRandom = Math.random;
        this.results = [[], []];
        this.conditionIndex = 0;
        this.replicateIndex = 0;
        this.previousWorldRules = {
            auto_reset: WorldConfig.auto_reset,
            auto_pause: WorldConfig.auto_pause
        };
        WorldConfig.auto_reset = false;
        WorldConfig.auto_pause = false;
        this.active = true;
        $("#experiment-run").prop("disabled", true);
        $("#experiment-cancel").prop("disabled", false);
        $("#experiment-results").empty();
        this.runCondition(0, 0);
    }

    createRandom(seed) {
        let state = seed >>> 0;
        return function() {
            state += 0x6D2B79F5;
            let value = state;
            value = Math.imul(value ^ (value >>> 15), value | 1);
            value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
            return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
        };
    }

    restoreRandom() {
        if (this.originalRandom) {
            Math.random = this.originalRandom;
            this.originalRandom = null;
        }
    }

    runCondition(conditionIndex, replicateIndex) {
        this.conditionIndex = conditionIndex;
        this.replicateIndex = replicateIndex;
        this.controlPanel.setPaused(true);
        // Each A/B pair gets the same random seed; each repeat gets a new seed.
        this.currentSeed = (this.baseSeed + replicateIndex) >>> 0;
        Math.random = this.createRandom(this.currentSeed);
        this.env.loadRaw(JSON.parse(JSON.stringify(this.baseline)));
        const { label, ...settings } = this.conditions[conditionIndex];
        Hyperparams.loadJsonObj(Object.assign({}, this.baseline.controls, settings));
        this.controlPanel.updateHyperparamUIValues();
        this.controlPanel.stats_panel.reset();

        this.startTick = this.env.total_ticks;
        this.startPopulation = this.env.organisms.length;
        $("#experiment-status").text(
            this.conditions[conditionIndex].label + " · repeat " +
            (replicateIndex + 1) + " of " + this.repeats + " · 0%"
        );
        this.controlPanel.setPaused(false);
    }

    update() {
        if (!this.active) return;
        const elapsed = Math.max(0, this.env.total_ticks - this.startTick);
        const progress = Math.min(100, Math.floor(elapsed / this.duration * 100));
        if (elapsed >= this.duration) {
            this.completeCondition();
        } else if (elapsed % 25 === 0) {
            $("#experiment-status").text(
                this.conditions[this.conditionIndex].label + " · repeat " +
                (this.replicateIndex + 1) + " of " + this.repeats + " · " + progress +
                "% · " + elapsed.toLocaleString() + " / " + this.duration.toLocaleString() + " ticks"
            );
        }
    }

    collectResult() {
        const population = this.env.organisms.length;
        const totalCells = this.env.organisms.reduce((sum, org) =>
            sum + (org.anatomy && org.anatomy.cells ? org.anatomy.cells.length : 0), 0);
        return {
            population,
            populationChange: population - this.startPopulation,
            species: FossilRecord.numExtantSpecies(),
            averageCells: population ? totalCells / population : 0,
            largestOrganism: this.env.largest_cell_count,
            mutationRate: this.env.averageMutability()
        };
    }

    completeCondition() {
        this.controlPanel.setPaused(true);
        this.results[this.conditionIndex].push(this.collectResult());

        if (this.conditionIndex === 0) {
            this.runCondition(1, this.replicateIndex);
        } else if (this.replicateIndex + 1 < this.repeats) {
            this.runCondition(0, this.replicateIndex + 1);
        } else {
            this.finishComparison();
        }
    }

    finishComparison() {
        this.active = false;
        this.restoreRandom();
        WorldConfig.auto_reset = this.previousWorldRules.auto_reset;
        WorldConfig.auto_pause = this.previousWorldRules.auto_pause;
        $("#experiment-status").text(
            "Comparison complete · " + this.repeats + " paired repeats · seeds " +
            this.baseSeed + "–" + ((this.baseSeed + this.repeats - 1) >>> 0) + "."
        );
        $("#experiment-run").prop("disabled", false);
        $("#experiment-cancel").prop("disabled", true);
        this.renderResults();
    }

    cancelComparison() {
        if (!this.active) return;
        this.controlPanel.setPaused(true);
        this.active = false;
        this.restoreRandom();
        WorldConfig.auto_reset = this.previousWorldRules.auto_reset;
        WorldConfig.auto_pause = this.previousWorldRules.auto_pause;
        $("#experiment-status").text("Comparison stopped. The current world is left paused.");
        $("#experiment-run").prop("disabled", false);
        $("#experiment-cancel").prop("disabled", true);
    }

    restoreBaseline() {
        if (!this.baseline || this.active) return;
        this.controlPanel.setPaused(true);
        this.env.loadRaw(JSON.parse(JSON.stringify(this.baseline)));
        Hyperparams.loadJsonObj(this.baseline.controls);
        this.controlPanel.updateHyperparamUIValues();
        this.controlPanel.stats_panel.reset();
        $("#experiment-status").text("Starting ecosystem restored.");
    }

    summarize(values, key) {
        const numbers = values.map(value => value[key]);
        const mean = numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
        const min = Math.min(...numbers);
        const max = Math.max(...numbers);
        const format = value => Number.isInteger(value) ? String(value) : value.toFixed(2);
        return format(mean) + " (range " + format(min) + "–" + format(max) + ")";
    }

    renderResults() {
        const a = this.results[0];
        const b = this.results[1];
        if (!a.length || !b.length) return;
        const rows = [
            ["Final population", "population"],
            ["Population change", "populationChange"],
            ["Surviving species", "species"],
            ["Average cells / organism", "averageCells"],
            ["Largest organism (cells)", "largestOrganism"],
            ["Average mutation rate", "mutationRate"]
        ];
        let html = "<table class='experiment-result-table'><thead><tr><th>Measure</th><th>Condition A · mean (range)</th><th>Condition B · mean (range)</th></tr></thead><tbody>";
        for (const row of rows) {
            html += "<tr><th>" + row[0] + "</th><td>" + this.summarize(a, row[1]) +
                "</td><td>" + this.summarize(b, row[1]) + "</td></tr>";
        }
        html += "</tbody></table>";
        $("#experiment-results").html(html);
    }
}

module.exports = ExperimentLab;
