/*
  Note: This is shitcode just meant to get the job done, I'm not learning typescript...

  Reads the manifest.json from download-mods and re-structures in solder mods-dir format

  This will zip up the .jar files into a mods/mod.jar format then place them in:
    mods/mod-slug/mod-slug-version.zip

  This will also create a .sql file for initially importing into the solder DB

  (Yes yes this could be async but idgaf; This only runs once to populate the initial solder db/fs)
*/

// Usage: solder-package [params] <mods_dir> <output_dir>

var fs = require('fs');
var util = require('util');
var path = require('path');
var mkdirp = require('mkdirp');
var spawnSync = require('child_process').spawnSync;
var JSZip = require("jszip");
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
  // Read mcmod.info or fallback to info in filename
  var unzip = spawnSync('unzip', ['-p', jar_path, 'mcmod.info']);
  if (!unzip.error && unzip.stdout) {
    try {
      // var escaped_json = unzip.stdout.toString().replace('\n', '\\n');
      // Some mods think its okay to have raw newlines in their strings...
      var mcmod_json = JSON.parse(unzip.stdout)[0];
    } catch(e) {};

    if (mcmod_json && mcmod_json.mcversion && mcmod_json.version) {
      if (mcmod_json.version.includes(mcmod_json.mcversion)) {
        return mcmod_json.version;
      } else {
        return mcmod_json.mcversion + '-' + mcmod_json.version;
      }
    } else {
      // Fallback to version found in filename
      var filename = path.basename(jar_path);
      var version_re = /.+?\-?([0-9\.\-mc]+)\.jar/;
      var version = version_re.exec(filename);
      if (version && version[1]) {
        return version[1];
      } else {
        return 'undefinedbecausetrashmod';
      }
    }
  } else {
    console.error(jar_path + " has no mcmod.info!");
  }
  return '';
}

export interface IModInfo {
  filename: string,
  mod_slug: string,
  mod_info: object,
  jar_path: string,
  mod_ver: string,
  zip_name: string,
  out_path: string
};

var to_package: IModInfo[] = []; // Will contain the mods that need to be packaged
var manifest = require(args.mods_dir + '/manifest.json');
for (var section in manifest) {
  if (section.toLowerCase().includes('client')) { continue; }
  for (var mod_id in manifest[section]) {
    var mod_slug = mod_id.split(':')[1];
    var mod_info = manifest[section][mod_id];
    var jar_path = util.format("%s/%s/%s", args.mods_dir, section, mod_info.filename);
    var mod_ver  = getModVersion(mod_info, jar_path);
    var zip_name = util.format("%s-%s.zip", mod_slug, mod_ver);
    var out_path = util.format("%s/mods/%s/%s", args.output_dir, mod_slug, zip_name);
    var todo: IModInfo = {
      filename: mod_info.filename,
      mod_slug: mod_slug,
      mod_info: mod_info,
      jar_path: jar_path,
      mod_ver: mod_ver,
      zip_name: zip_name,
      out_path: out_path
    };
    to_package.push(todo);
  }
}

var pindex = 0;
function package_mod(index) {
  pindex += 1;
  var mod_info = to_package[index];
  if (!mod_info) { return; }
  var zip = new JSZip();
  var jar_data = fs.readFileSync(mod_info.jar_path);
  mkdirp.sync(path.dirname(mod_info.out_path));
  zip.file('mods/' + mod_info.filename, jar_data);
  zip.generateNodeStream({type:'nodebuffer',streamFiles:true})
  .pipe(fs.createWriteStream(mod_info.out_path))
  .on('finish', function () {
      console.log(mod_info.out_path + " written.");
      package_mod(pindex);
  });
}
package_mod(0);
