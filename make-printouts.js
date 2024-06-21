const csv = require("csvtojson");
const helper = require("./helper.js");
const fs = require('node:fs');

async function main() {
    const config = await helper.getConfig();
    const csvStartList = await csv().fromFile("./files/startlist.csv");
    const riders = csvStartList.map(entry => ({
        name: entry["Name"],
        plate: entry["Bib"],
        wave: entry["Wave"],
        category: entry["Category"]
    }));
    const rosterRiders = [...await helper.getRoster(config), ...await helper.getWebscorerRegistrations(config)];
    riders.forEach( r => {
        const rosterRider = rosterRiders.find( rr => r.name === `${rr.lastName}, ${rr.firstName}`);
        r.phone = rosterRider.phone;
        r.parent = rosterRider.parent;
        const start = 5;
        const end = r.wave.indexOf('(') - 1;
        r.waveNumber = Number(r.wave.slice(start, end));
    });
    const sortedRiders = riders.sort((a, b) => a.wave - b.wave);

    console.log("Building CSV");
    const csvOutput = ["Here, Wave, Name, #, Wave 2, Cat, Parent, Phone"];
    sortedRiders.forEach(r => {
            const row = ` , ${r.waveNumber}, \"${r.name}\", ${r.plate}, ${r.wave}, ${r.category}), \"${r.parent}\", ${r.phone}`
            csvOutput.push(row);
    });

    fs.writeFile("./files/checkin.csv", csvOutput.join("\n"), e => console.error(e));

}

main();