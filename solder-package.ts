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

function getMCMOD(jar_path) {
  // Read mcmod.info or fallback to info in filename
  var unzip = spawnSync('unzip', ['-p', jar_path, 'mcmod.info']);
  if (!unzip.error && unzip.stdout) {
    try {
      // var escaped_json = unzip.stdout.toString().replace('\n', '\\n');
      // Some mods think its okay to have raw newlines in their strings...
      var mcmod_json = JSON.parse(unzip.stdout)[0];
    } catch(e) {
      return {};
    };
    return mcmod_json;
  } else {
    console.error(jar_path + " has no mcmod.info!");
  }
  return {};
}

export interface IModInfo {
  filename: string,
  jar_path: string,
  mod_slug: string,
  mod_ver: string,
  zip_name: string,
  zip_path: string,
  manifest: object,
  mcmod: object
};

var to_package: IModInfo[] = []; // Will contain the mods that need to be packaged
var manifest = require(args.mods_dir + '/manifest.json');
for (var section in manifest) {
  for (var mod_id in manifest[section]) {
    var mod_slug = mod_id.split(':')[1];
    var mod_mani = manifest[section][mod_id];
    var jar_path = util.format("%s/%s/%s", args.mods_dir, section, mod_mani.filename);
    var mod_ver = 'undefinedbecausetrashmod';
    var mcmod_json = getMCMOD(jar_path);
    if (mcmod_json && mcmod_json.mcversion && mcmod_json.version
      && !mcmod_json.mcversion.includes('$') && !mcmod_json.version.includes('$')) {
      var version_re = /.*?([0-9\.\-mc]+)/;
      if (mcmod_json.version.includes(mcmod_json.mcversion)) {
        var check_re = version_re.exec(mcmod_json.version);
        mod_ver = (check_re && check_re[1]) ? check_re[1] : mod_ver;
      } else {
        var clean_ver = version_re.exec(mcmod_json.version);
        var clean_mcver = version_re.exec(mcmod_json.mcversion);
        if (clean_ver && clean_ver[1]) {
          mod_ver = '' + clean_ver[1]
        }
        if (clean_mcver && clean_mcver[1]) {
          mod_ver += clean_mcver[1];
        }
      }
    } else {
      // Fallback to version found in filename
      var filename = path.basename(jar_path);
      var version_re = /.+?\-?([0-9\.\-mc]+)\.jar/;
      var version = version_re.exec(filename);
      if (version && version[1]) {
        mod_ver = version[1];
      }
    }

    var zip_name = util.format("%s-%s.zip", mod_slug, mod_ver);
    var zip_path = util.format("%s/mods/%s/%s", args.output_dir, mod_slug, zip_name);
    var todo: IModInfo = {
      filename: mod_mani.filename,
      jar_path: jar_path,
      mod_slug: mod_slug,
      mod_ver: mod_ver,
      zip_name: zip_name,
      zip_path: zip_path,
      manifest: mod_mani,
      mcmod: mcmod_json
    };
    to_package.push(todo);
  }
}

// Recursively write our packaged jar mods
var nindex = 0;
function package_mod(index) {
  nindex += 1;
  var mod_info = to_package[index];
  if (!mod_info) { return; }
  var zip = new JSZip();
  var jar_data = fs.readFileSync(mod_info.jar_path);
  mkdirp.sync(path.dirname(mod_info.zip_path));
  zip.file('mods/' + mod_info.filename, jar_data);
  zip.generateNodeStream({type:'nodebuffer',streamFiles:true})
  .pipe(fs.createWriteStream(mod_info.zip_path))
  .on('finish', function () {
      console.log(mod_info.zip_path + " written.");
      package_mod(nindex);
  });
}
package_mod(0);

// Create SQL file for importing into DB
for (var key in to_package) {
  var mod = to_package[key];
  if (mod.mod_slug.includes('thaum')) {
    console.log('\n', mod);
  }
  //console.log(mod.mod_ver, '\t', mod.zip_name);
}
