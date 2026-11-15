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
        this.results = [];
        this.trialIndex = 0;
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
        this.duration = Math.max(100, Math.floor(Number($("#experiment-duration").val()) || 5000));
        const seedValue = Number($("#experiment-seed").val());
        this.seed = Number.isFinite(seedValue) ? (Math.floor(seedValue) >>> 0) : 2026;
        this.originalRandom = Math.random;
        this.results = [];
        this.trialIndex = 0;
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
        this.runCondition(0);
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

    runCondition(index) {
        this.trialIndex = index;
        this.controlPanel.setPaused(true);
        // Both trials restart the random stream from the same seed.
        Math.random = this.createRandom(this.seed);
        this.env.loadRaw(JSON.parse(JSON.stringify(this.baseline)));
        Hyperparams.loadJsonObj(Object.assign({}, this.baseline.controls, this.conditions[index]));
        this.controlPanel.updateHyperparamUIValues();
        this.controlPanel.stats_panel.reset();

        this.startTick = this.env.total_ticks;
        this.startPopulation = this.env.organisms.length;
        $("#experiment-status").text(
            this.conditions[index].label + " running · 0% · " +
            this.duration.toLocaleString() + " ticks"
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
                this.conditions[this.trialIndex].label + " running · " + progress +
                "% · tick " + elapsed.toLocaleString() + " / " + this.duration.toLocaleString()
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
        this.results.push(this.collectResult());
        if (this.trialIndex === 0) {
            this.runCondition(1);
            return;
        }
        this.finishComparison();
    }

    finishComparison() {
        this.active = false;
        this.restoreRandom();
        WorldConfig.auto_reset = this.previousWorldRules.auto_reset;
        WorldConfig.auto_pause = this.previousWorldRules.auto_pause;
        $("#experiment-status").text(
            "Comparison complete · same starting world, duration, and random seed (" + this.seed + ")."
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
        this.controlPanel.updateHyperparamUIValues();
        this.controlPanel.stats_panel.reset();
        $("#experiment-status").text("Starting ecosystem restored.");
    }

    renderResults() {
        const a = this.results[0];
        const b = this.results[1];
        if (!a || !b) return;
        const rows = [
            ["Final population", a.population, b.population],
            ["Population change", a.populationChange, b.populationChange],
            ["Surviving species", a.species, b.species],
            ["Average cells / organism", a.averageCells.toFixed(2), b.averageCells.toFixed(2)],
            ["Largest organism", a.largestOrganism + " cells", b.largestOrganism + " cells"],
            ["Average mutation rate", a.mutationRate.toFixed(2), b.mutationRate.toFixed(2)]
        ];
        let html = "<table class='experiment-result-table'><thead><tr><th>Measure</th><th>Condition A</th><th>Condition B</th></tr></thead><tbody>";
        for (const row of rows) {
            html += "<tr><th>" + row[0] + "</th><td>" + row[1] + "</td><td>" + row[2] + "</td></tr>";
        }
        html += "</tbody></table>";
        $("#experiment-results").html(html);
    }
}

module.exports = ExperimentLab;
