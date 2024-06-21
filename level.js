
const teams = [
    'Blue Balance',
    'Pink Balance',
    'Green Balance',
    'Red Rollers',
    'Orange Rollers',
    'Yellow Rollers',
    'Green Rollers',
    'Blue Rollers',
    'Purple Rollers',
    'Red Grinders',
    'Orange Grinders',
    'Yellow Grinders',
    'Green Grinders',
    'Blue Grinders',
    'Purple Grinders',
    'Red Advanced',
    'Orange Advanced',
    'Yellow Advanced',
    'Green Advanced',
    'Blue Advanced',
    'Purple Advanced',
    'Pink Advanced',
    'Neon Advanced',
    'White Advanced',
    'Black Advanced'
]


exports.default = function (name) {
   return teams.findIndex( t => name.includes(t));
}