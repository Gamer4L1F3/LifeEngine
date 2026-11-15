const Designer = require('../Organism/NaturalOrganismDesigner');

class NaturalOrganismDesignerUI {
    static mount() {
        if (document.getElementById('natural-organism-designer')) return;
        const host = document.createElement('section');
        host.id = 'natural-organism-designer';
        host.innerHTML = `
          <style>
            #natural-organism-designer{position:fixed;right:18px;bottom:18px;z-index:10000;font:14px/1.45 Arial,sans-serif;color:#e8edf2}
            #natural-organism-designer button,#natural-organism-designer select,#natural-organism-designer input{font:inherit}
            #nod-open{background:#e8edf2;color:#18232b;border:0;border-radius:4px;padding:10px 15px;font-weight:700;cursor:pointer;box-shadow:0 3px 14px #0005}
            #nod-panel{display:none;width:310px;background:#17232c;border:1px solid #52616b;border-radius:7px;padding:16px;box-shadow:0 10px 35px #0009;margin-bottom:9px}
            #nod-panel h2{font-size:17px;margin:0 0 4px;color:#fff}#nod-panel p{color:#b9c5cc;font-size:12px;margin:0 0 13px}
            #nod-panel label{display:flex;justify-content:space-between;gap:12px;margin:9px 0;color:#dce4e9}
            #nod-panel input,#nod-panel select{width:118px;background:#0f171d;color:#fff;border:1px solid #53616a;border-radius:3px;padding:5px}
            #nod-panel input[type=range]{width:118px;padding:0;accent-color:#9ab8c4}
            #nod-generate{width:100%;margin-top:12px;padding:9px;background:#b9d0d8;border:0;border-radius:3px;color:#13212a;font-weight:700;cursor:pointer}
            #nod-status{min-height:30px;margin-top:10px;color:#b9c5cc;font-size:12px}
          </style>
          <div id="nod-panel">
            <h2>Natural Organism Designer</h2>
            <p>Evolve a body plan against ecological pressures, then export its genome.</p>
            <label>Ecological strategy <select id="nod-objective"><option value="balanced">Generalist</option><option value="survivor">Survivor</option><option value="colonizer">Colonizer</option><option value="predator">Predator</option></select></label>
            <label>Food abundance <input id="nod-food" type="range" min="0" max="100" value="55"></label>
            <label>Environmental danger <input id="nod-danger" type="range" min="0" max="100" value="25"></label>
            <label>Need for mobility <input id="nod-mobility" type="range" min="0" max="100" value="50"></label>
            <label>Evolution generations <input id="nod-generations" type="number" min="10" max="300" value="80"></label>
            <label>Population size <input id="nod-population" type="number" min="12" max="100" value="36"></label>
            <label>Maximum body cells <input id="nod-cells" type="number" min="3" max="30" value="12"></label>
            <label>Random seed <input id="nod-seed" type="number" value="20261114"></label>
            <button id="nod-generate">EVOLVE & EXPORT JSON</button>
            <div id="nod-status" aria-live="polite">The optimizer selects by simulated ecological performance, not by a fixed creature template.</div>
          </div>
          <button id="nod-open" type="button">＋ DESIGN ORGANISM</button>`;
        document.body.appendChild(host);
        const panel = host.querySelector('#nod-panel');
        host.querySelector('#nod-open').addEventListener('click', () => {
            panel.style.display = panel.style.display === 'block' ? 'none' : 'block';
        });
        host.querySelector('#nod-generate').addEventListener('click', () => {
            const value = id => host.querySelector('#' + id).value;
            const status = host.querySelector('#nod-status');
            try {
                const result = Designer.design({
                    objective: value('nod-objective'), food: value('nod-food'),
                    danger: value('nod-danger'), mobility: value('nod-mobility'),
                    generations: value('nod-generations'), population: value('nod-population'),
                    maxCells: value('nod-cells'), seed: value('nod-seed')
                });
                const json = JSON.stringify(result.organism, null, 2);
                const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
                const link = document.createElement('a');
                link.href = url;
                link.download = result.organism.name.toLowerCase() + '.json';
                document.body.appendChild(link); link.click(); link.remove();
                URL.revokeObjectURL(url);
                status.textContent = 'Exported ' + result.organism.name + ' · ' +
                    result.organism.anatomy.cells.length + ' cells · fitness ' +
                    result.report.bestFitness + ' · ' + result.report.generations + ' generations';
            } catch (error) {
                status.textContent = 'Could not generate organism: ' + error.message;
                console.error(error);
            }
        });
    }
}
module.exports = NaturalOrganismDesignerUI;
