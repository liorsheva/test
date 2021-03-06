const fs = require('fs-extra');
const copydir = require('copy-dir');

const path = require('path');
const dirTree = require("directory-tree");
const cwd = path.parse(process.cwd())



class file_handler_class {
	constructor(path_to_projects) {
		this.root_path = path.join(cwd.dir, cwd.name, path_to_projects);
		this.separator = '@'
		this.info_file_name = 'inf@.txt'

		//creating the projects root directory
		if (!fs.existsSync(this.root_path)) {
			fs.mkdirSync(this.root_path)
		}

		//fs.removeSync(path.join(this.root_path, "united@lior#4444", "kkk"))

	}

	get_all_projects_by_names(needed_projects) {
		let items_list = [];
		if (needed_projects == []) {
			fs.readdirSync(this.root_path).forEach(project_name => {
				let file_data = JSON.parse(fs.readFileSync(path.join(this.root_path, project_name, this.info_file_name), "utf8"))
				let creationDate = fs.statSync(path.join(this.root_path, project_name)).birthtime

				items_list.push({ id: project_name, projectName: project_name.split(this.separator)[0], creator: file_data.creator, creationDate: creationDate });
			});
		}
		else {
			fs.readdirSync(this.root_path).forEach(project_name => {
				if (needed_projects.includes(project_name)) {
					let file_data = JSON.parse(fs.readFileSync(path.join(this.root_path, project_name, this.info_file_name), "utf8"))
					let creationDate = fs.statSync(path.join(this.root_path, project_name)).birthtime
					items_list.push({ id: project_name, projectName: project_name.split(this.separator)[0], creator: file_data.creator, creationDate: creationDate });
				}
			});
		}
		return items_list

	}




	get_all_project_files_names(folder_name) {
		return {
			'module': folder_name.split('@')[0],
			'id': folder_name,
			'children': this.turn_files_array_into_json(this.root_path, folder_name)
		}
	}

	create_new_project(project_name, creator) {
		let projectDirName = path.join(this.root_path, project_name + this.separator + creator.id);
		let projectFileName = path.join(this.root_path, project_name + this.separator + creator.id, this.info_file_name);
		if (!fs.existsSync(projectDirName) && !fs.existsSync(projectFileName)) {
			fs.mkdirSync(path.join(projectDirName))
			fs.writeFileSync(projectFileName, `{"creator":"${creator.fullName}"}`, (err) => { })
			return true
		}
		else {
			return false
		}
	}

	clone_project(project_name, creator) {
		let originalPath = path.join(this.root_path, project_name + this.separator + creator)
		let clonePath = path.join(this.root_path, project_name + " - Copy" + this.separator + creator)
		let infoFilePath = path.join(this.root_path, project_name + this.separator + creator, this.info_file_name);
		if (!fs.existsSync(clonePath)) {
			fs.mkdirSync(path.join(clonePath))
		}
		copydir.sync(originalPath, clonePath)

		fs.writeFileSync(infoFilePath, "", (err) => { })
	}

	add_file_to_a_project(folder_name, file_name) {
		let projectFileName = path.join(this.root_path, folder_name, file_name);
		if (!fs.existsSync(projectFileName)) {
			fs.writeFileSync(projectFileName, "", (err) => { })
			return true
		}
		else {
			return false
		}
	}

	add_dir_to_a_project(folder_name, dir_name) {
		let projectFileName = path.join(this.root_path, folder_name, dir_name);
		if (!fs.existsSync(projectFileName)) {
			fs.mkdirSync(path.join(projectFileName))
			return true
		}
		else {
			return false
		}
	}

	get_project_info(folder_name) {
		let content = fs.readFileSync(path.join(this.root_path, folder_name, this.info_file_name), "utf8");
		return content;
	}

	set_project_info(folder_name, data) {
		fs.writeFileSync(path.join(this.root_path, folder_name, this.info_file_name), data, (err) => { });
	}

	set_file_contents(folder_name, file_name, data) {
		fs.writeFileSync(path.join(this.root_path, folder_name, file_name), data, (err) => { });
	}

	get_file_contents(folder_name, file_name) {
		let content = fs.readFileSync(path.join(this.root_path, folder_name, file_name), "utf8");
		return content;
	}

	delete_path(object_path) {
		return fs.removeSync(path.join(this.root_path, object_path))
	}

	rename_object(objectPath, newName) {
		let newPath = objectPath.split("/")
		newPath.pop()
		newPath = path.join(newPath.join("/"), newName)
		return fs.renameSync(path.join(this.root_path, objectPath), path.join(this.root_path, newPath));
	}

	move_object(src, dst) {
		fs.moveSync(path.join(this.root_path, src), path.join(this.root_path, dst))
	}



	turn_files_array_into_json(root_path, project_path) {
		var arry_of_files = []
		var dir_path = path.join(root_path, project_path)
		var files_in_dir = fs.readdirSync(dir_path)
		for (var file of files_in_dir) {
			if (file != this.info_file_name) {
				var temp_json = {};
				temp_json["module"] = file;


				temp_json["id"] = path.join(dir_path, file).split(this.root_path + "/")[1];

				if (fs.statSync(path.join(dir_path, file)).isDirectory()) {

					temp_json["children"] = this.turn_files_array_into_json(dir_path, file);
				}
				else {
					temp_json["leaf"] = true
				}
				arry_of_files.push(temp_json)
			}
		}
		return arry_of_files
	}

}






/*
{
	module: "united@lior#4444",
	id: "0"
	children: [
		{
			module: "bonjur.txt",
			id: "1",
			leaf: true
		},
		{
			module: "ddd",
			id: "2",
			children: []
		}
	]
}
*/


module.exports = file_handler_class;

