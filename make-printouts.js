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
        gender: entry["Gender"],
        category: entry["Category"],
        phone: entry["Phone"],
        parent: entry["Parent"]
    }));
    riders.forEach( r => {
        const start = 5;
        const end = r.wave.indexOf('(') - 1;
        r.waveNumber = Number(r.wave.slice(start, end));
    });
    const sortedRiders = riders.sort((a, b) => a.wave - b.wave);

    console.log("Building CSV");
    const csvOutput = ["Here, Wave, Name, #, Wave 2, Cat, Parent, Phone"];
    sortedRiders.forEach(r => {
            const row = ` , ${r.waveNumber}, \"${r.name}\", ${r.plate}, ${r.wave}, ${r.category}, \"${r.parent}\", ${r.phone}`
            csvOutput.push(row);
    });

    fs.writeFile("./files/checkin.csv", csvOutput.join("\n"), e => console.error(e));

    console.log("Building CSV");
    const csvOutput2 = ["Wave, Name, #, Wave, M/F"];
    sortedRiders.forEach(r => {
        const row = `${r.waveNumber}, \"${r.name}\", ${r.plate}, ${r.wave}, ${r.gender}`
        csvOutput2.push(row);
    });

    fs.writeFile("./files/wavesheet.csv", csvOutput2.join("\n"), e => console.error(e));

}

main();