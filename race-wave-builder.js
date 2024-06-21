const fs = require('node:fs');
const helper = require('./helper');

async function main() {

    const config = await helper.getConfig();
    const riders = await helper.getRoster(config);
    const webscorerRiders = await helper.getWebscorerRegistrations(config);
    const registeredRiders = await helper.getRegisteredRiders(config, riders);

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
    const csvOutput = ["Name, First Name, Last Name, Distance, Category, Wave, Age, Gender, Email, Bib, Parent, Phone"];
    waves.forEach((wave, index) => {
        wave.riders.forEach(r => {
            const row = `\"${r.lastName}, ${r.firstName}\", ${r.firstName}, ${r.lastName}, ${r.distance}, ${r.category}, Wave ${index + 1} (${r.category}), ${r.age}, ${r.gender}, ${r.email}, ${r.plateNumber}, ${r.parent}, ${r.phone}`
            csvOutput.push(row);
        });
    });

    fs.writeFile("./files/startlist.csv", csvOutput.join("\n"), e => console.error(e));

    const ridersWithNoWave = registeredRiders.filter( r => r.wave === null || r.wave === undefined);
    console.log(`${ridersWithNoWave.length} Riders with no wave`);
    console.log(ridersWithNoWave);

}

main();

