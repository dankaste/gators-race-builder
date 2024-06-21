const csv = require("csvtojson");
const toLevel = require("./level")
const moment = require("moment");
const fs = require('node:fs');

async function main() {
    const readYamlFile = require('read-yaml-file')

    const config = await readYamlFile('./config.yml');
    const csvRosterData = await csv().fromFile(config.rosterFilePath);

    const riders = csvRosterData.map(entry => ({
        id: entry['id'],
        firstName: entry['player_first_name'],
        lastName: entry['player_last_name'],
        plateNumber: entry['number'],
        gender: entry['gender'],
        email: entry['parent1_email'],
        level: toLevel.default(entry['team']),
        age: moment(config.raceDate).diff(entry['birth_date'], 'years')
    }));
    console.log(`Loaded ${riders.length} riders from Roster`)

    const webscorerExportData = await csv().fromFile(config.webscorerRegistrationFilePath);

    const webscorerRiders = webscorerExportData.map(entry => ({
        firstName: entry['First name'],
        lastName: entry['Last name'],
        plateNumber: entry['Race Plate Number (leave blank if you need a plate)'],
        gender: entry['Gender'] === "Male" ? "M" : "F",
        email: entry['Email'],
        level: 1,
        distance: entry['Distance'],
        age: moment(config.raceDate).diff(entry['Date of birth'], 'years')
    }));

    console.log(`Loaded ${webscorerRiders.length} riders from Webscorer`);

    const csvRegistrations = await csv().fromFile(config.raceRegistrationFilePath);
    const registeredIds = csvRegistrations.filter(entry => entry['status'] !== "Canceled").map(entry => ({id: entry['player_id'], distance: entry['package_name']}));
    console.log(`${registeredIds.length} riders registered from race`)
    const registeredRiders = registeredIds.map(ri => {
        const rider = riders.find(r => r.id === ri.id);
        if (rider === null || rider === undefined) {
            console.log(`No roster rider found for registered id ${ri.id}`);
            return ri;
        }
        rider.distance = ri.distance;
        return rider;
    });

    registeredRiders.push(...webscorerRiders);

    const waves = [];

    const ridersByCategory = config.categories.map(cat => ({
        catName: cat.name,
        maxSize: cat.maxSize,
        sorted: cat.sorted,
        riders: registeredRiders
            .filter(r => cat.ages.includes(r.age) && cat.gender.includes(r.gender) &&r.distance === cat.distance)
    }));

    console.log(`Found ${ridersByCategory.length} categories`)
    console.log(`Building waves`)

    ridersByCategory.forEach(rc => {
        if(rc.riders.length > 0) {
            console.log(`Category ${rc.catName}`)
            console.log(`${rc.riders.length} Riders`);
            const numWaves = Math.ceil(rc.riders.length / rc.maxSize);
            console.log(`Building ${numWaves} waves`)
            const waveSize = Math.ceil(rc.riders.length / numWaves);
            console.log(`Wave size is ${waveSize}`)
            let sortedRiders = (rc.sorted ) ? rc.riders.sort((a, b) => a.level - b.level) : rc.riders;
            for (let i = 0; i < numWaves; ++i) {
                const start = i * waveSize;
                const end = Math.min(start + waveSize, sortedRiders.length)
                const waveRiders = sortedRiders.slice(start, end);
                waves.push({riders: waveRiders});
                console.log(`Adding wave ${waves.length+1} with ${waveRiders.length} riders`)
                waveRiders.forEach( r => {
                    r.wave=`Wave ${waves.length+1}`;
                    r.category=rc.catName;
                });
            }
        } else {
            console.log(`No riders found for category ${rc.catName}`)
        }
    });

    console.log("Building CSV");
    const csvOutput = ["Name, First Name, Last Name, Distance, Category, Wave, Age, Gender, Email, Bib"];
    waves.forEach((wave, index) => {
        wave.riders.forEach(r => {
            const row = `\"${r.lastName}, ${r.firstName}\", ${r.firstName}, ${r.lastName}, ${r.distance}, ${r.category}, Wave ${index + 1} (${r.category}), ${r.age}, ${r.gender}, ${r.email}, ${r.plateNumber}`
            csvOutput.push(row);
        });
    });

    fs.writeFile("./files/startlist.csv", csvOutput.join("\n"), e => console.error(e));

    const ridersWithNoWave = registeredRiders.filter( r => r.wave === null || r.wave === undefined);
    console.log(`${ridersWithNoWave.length} Riders with no wave`);
    console.log(ridersWithNoWave);

}

main();

