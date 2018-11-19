/*
  Reads the manifest.json from download-mods and re-structures in solder mods-dir format

  This will zip up the .jar files into a mods/mod.jar format then place them in:
    mods/mod-slug/mod-slug-version.zip

  This will also create a .sql file for initially importing into the solder DB

  (Yes yes this could be async but idgaf; This only runs once to populate the initial solder db/fs)
*/

// Usage: solder-package [params] <mods_dir> <output_dir>

var fs = require("fs");
var util = require("util");
var spawnSync = require('child_process').spawnSync;
//var JSZip = require("jszip");
var ArgumentParser = require('argparse').ArgumentParser;
var parser = new ArgumentParser({ addHelp: true });
parser.addArgument(
  [ '-d', '--dry' ], {
    action: 'storeTrue',
    help: 'Dry run, wont make any actual changes.'
  }
);
parser.addArgument(
  'mods_dir', {
    help: 'Directory containing the mod jars and manifest.json'
  }
);
parser.addArgument(
  'output_dir', {
    help: 'Directory to output the formatted mod zips and folders.'
  }
);
var args = parser.parseArgs();

function getModVersion(mod_info, jar_path) {
  // Read mcmod.info or fallback to .jar name
  // mod_info.filename.replace('jar', 'zip');
  var unzip = spawnSync("unzip", ["-p", jar_path, "mcmod.info"]);
  if (!unzip.error && unzip.stdout) {
    try {
      var mcmod_json = JSON.parse(unzip.stdout)[0];
    } catch(e) { console.error(e) };

    if (mcmod_json && mcmod_json.mcversion && mcmod_json.version) {
      return mcmod_json.mcversion + '-' + mcmod_json.version;
    } else {
      // Fallback to version found in filename
      return '1.0';
    }
  } else {
    console.error(jar_path + " has no mcmod.info!");
  }
  return '';
}

var manifest = require(args.mods_dir + '/manifest.json');
for (var section in manifest) {
  if (section.toLowerCase().includes('client')) { continue; }
  for (var mod_id in manifest[section]) {
    var mod_slug = mod_id.split(':')[1];
    var mod_info = manifest[section][mod_id];
    var jar_path = util.format("%s/%s/%s", args.mods_dir, section, mod_info.filename);
    //var jar_file = fs.readFileSync(jar_path);

    var mod_ver  = getModVersion(mod_info, jar_path);
    var zip_name = util.format("%s-%s.zip", mod_slug, mod_ver);
    var out_path = util.format("%s/mods/%s/%s", args.output_dir, mod_slug, zip_name);

    console.log(util.format('\n%s\n%s\n%s\n%s\n%s', mod_slug, jar_path, mod_ver, zip_name, out_path));
  }
}
