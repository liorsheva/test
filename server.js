const express = require('express');
const fs = require('fs-extra');
const http = require('http')
const io = require('socket.io')
var zipFolder = require('folder-zip-sync');
const Vibrant = require("node-vibrant")
const path = require('path');

const Mutex = require('async-mutex').Mutex;
const file_handler_module = require('./modules/file_handler');
const db_handler_module = require('./modules/db_handler');


const PORT = process.env.PORT || 3399
const app = express();

//creatng the webiste serving server
app.use(express.static(path.join(__dirname, 'build')))

app.get('/', function (req, res) {
	res.sendFile(path.join(__dirname, 'build', 'index.html'))
})

const server = app.listen(PORT, () => {
	console.log(`serving the client on port ${PORT}...`)
})

const soc = io(server)

const file_handler = new file_handler_module("olympusProjects");
const db_handler = new db_handler_module('users.db')
const fileLock = new Mutex();

const defaultPos = { "start": { "line": 0, "ch": 0 }, "end": { "line": 0, "ch": 0 } } //starting position of all users who joined the file

let socToDits = {};
//the socToDits format
/*
let temp = {
	"soc": {
		"project": "",
		"file": "", 
		"pos": ""
		"user": {
			"username": "",
			"fullName":"",
			"id": "" (email without "@gmail.com")
		}
	}
}
*/

let codeToProject = {};
//the codeToProject format
/*
let temp = {
	'1GAZ2B' : 'myProject1@ericashdod', 
	'2GZ34A' : 'myProject2@liorsheva103', 
}
*/


function componentToHex(c) {
	var hex = c.toString(16);
	return hex.length == 1 ? "0" + hex : hex;
}

function rgbToHex(rgb) {
	return "#" + componentToHex(Math.round(rgb[0])) + componentToHex(Math.round(rgb[1])) + componentToHex(Math.round(rgb[2]));
}

function hslToHex(h, s, l) {
	var r, g, b;
	if (s == 0) {
		r = g = b = l; // achromatic
	} else {
		var hue2rgb = function hue2rgb(p, q, t) {
			if (t < 0) t += 1;
			if (t > 1) t -= 1;
			if (t < 1 / 6) return p + (q - p) * 6 * t;
			if (t < 1 / 2) return q;
			if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
			return p;
		}

		var q = l < 0.5 ? l * (1 + s) : l + s - l * s;
		var p = 2 * l - q;
		r = hue2rgb(p, q, h + 1 / 3);
		g = hue2rgb(p, q, h);
		b = hue2rgb(p, q, h - 1 / 3);
	}
	return rgbToHex([r * 255, g * 255, b * 255]);

}



async function getVibrant(img) {
	const vibrant = new Vibrant(img)

	let color = await vibrant.getPalette().then(function (palette) { return palette.Vibrant._hsl; })
	// if(color[0] < 0.4){
	// 	color[0] += 0.6
	// }
	// if(color[1] < 0.4){
	// 	color[1] += 0.6
	// }
	color = hslToHex(color[0], color[1], color[2])
	if (color == "#7b8284") {
		color = "#2fb0d0"
	}

	return color
}



let errors = []
function errorHandler(err, socket, onHandlerName = "") {
	console.log(`${onHandlerName}: ${err.message}`)
	var now = new Date().getTime();
	if (errors.includes(err.message)) {
		socket.emit("error", "Server throwed an exception!")
		errors.push(err.message)
	}
	setTimeout(() => { removeFromErrors(err.message) }, 5000);
}

function removeFromErrors(message) {
	var index = errors.indexOf(message);
	if (index !== -1) {
		errors.splice(index, 1);
	}
}

app.get("/download", (req, res) => {
	const project_path = file_handler.root_path + `/${req.query.project}`
	const temp_zip_path = __dirname + `/${req.query.project}.zip`

	zipFolder(project_path, temp_zip_path);

	res.download(temp_zip_path, `${req.query.project.split(file_handler.separator)[0]}.zip`);

	fs.remove(temp_zip_path)
});

soc.on('connection', socket => {

	socket.on("dos-server-run", () => {
		socket.emit("dos-server-run")
	})

	socket.on('connect-user-to-server', async (user) => {
		deleteUsersCopy(user.id, socket)
		db_handler.add_user(user.id)

		socToDits[socket.id] = { "user": { "username": user.username, "fullName": user.fullName, "id": user.id, "imageUrl": user.imageUrl, "color": null }, "project": "", "file": "", "pos": defaultPos };
		socToDits[socket.id].user.color = await getVibrant(user.imageUrl)
	})

	socket.on('curser-moved', coordinates => {

		try {
			socToDits[socket.id].pos = coordinates;
			emitToUsersInFile(socket.id, 'curser-moved', { 'user': socToDits[socket.id].user, 'currPos': socToDits[socket.id].pos });

			//sending the user his own cursor for a cool ripple effect
			//socket.emit('curser-moved', { 'user': socToDits[socket.id].user, 'currPos': socToDits[socket.id].pos })
		}
		catch (err) {
			errorHandler(err, socket, 'curser-moved')
		}

	})

	socket.on('update-file', msg => {
		try {
			emitToUsersInFile(socket.id, 'update-file', msg);
			socket.emit('update-file', msg);

			updateFile(socToDits[socket.id].project, socToDits[socket.id].file, msg.payload, msg.start, msg.end);
		}
		catch (err) {
			errorHandler(err, socket, 'update-file')
		}
	})

	socket.on('paste-action', msg => {
		try {
			emitToUsersInFile(socket.id, 'paste-action', msg);
			socket.emit('paste-action', msg);
			updateFile(socToDits[socket.id].project, socToDits[socket.id].file, msg.payload, msg.start, msg.end);
		}
		catch (err) {
			errorHandler(err, socket, 'paste-action')
		}
	})

	socket.on('get-file-contents', fileName => {
		try {
			fileName = fileName.split(socToDits[socket.id].project + "/")[1]

			if (socToDits[socket.id].file !== fileName) { //if the user is not asking for the same file
				emitToUsersInFile(socket.id, "user-left-file", socToDits[socket.id].user);
				socToDits[socket.id].file = fileName;
			}
			let file_data = file_handler.get_file_contents(socToDits[socket.id].project, fileName);
			socket.emit("get-file-contents", { 'data': file_data, 'name': fileName });
			socket.emit("get-file-cursers", getUsersPosInFile(fileName));
		}
		catch (err) {
			errorHandler(err, socket, 'get-file-contents')
		}
	})

	socket.on('get-project-file-tree', (projectName) => {
		try {
			let temp = file_handler.get_all_project_files_names(projectName);

			//saving details
			socToDits[socket.id].file = ""
			socToDits[socket.id].project = projectName;

			socket.emit('get-project-file-tree', temp);
		}
		catch (err) {
			errorHandler(err, socket, 'get-project-file-tree')
		}
	})

	socket.on('generate-project-code', () => {
		try {
			//creating project code if the user is the creator of the project
			projectName = socToDits[socket.id].project;
			if (projectName.split(file_handler.separator)[1] == socToDits[socket.id].user.id) {
				//removing the code if it already existed
				for (let key in codeToProject) {
					if (codeToProject[key] == projectName) {
						delete codeToProject[key];
						break;
					}
				}
				let code = makeid()
				codeToProject[code] = projectName;
				socket.emit('generate-project-code', code)
			}
			else {
				socket.emit('generate-project-code', null)
			}
		}
		catch (err) {
			errorHandler(err, socket, 'generate-project-code')
		}
	})

	socket.on('create-file', fileData => {
		try {
			let fullFilePath = getFullPath(fileData, socToDits[socket.id].project)
			file_handler.add_file_to_a_project(socToDits[socket.id].project, fullFilePath);
			emitToUsersInProject(socket.id, 'file-created', fileData);
		}
		catch (err) {
			errorHandler(err, socket, 'create-file')
		}
	})

	socket.on('create-folder', folderData => {
		try {
			folderData, folderData.path.split(socToDits[socket.id].project + "/")
			let fullFolderPath = getFullPath(folderData, socToDits[socket.id].project)
			file_handler.add_dir_to_a_project(socToDits[socket.id].project, fullFolderPath);
			emitToUsersInProject(socket.id, 'folder-created', folderData);
		}
		catch (err) {
			errorHandler(err, socket, 'create-folder')
		}
	})

	socket.on('delete-project', folderName => {
		try {
			let userId = socToDits[socket.id].user.id;

			if (userId === folderName.split(file_handler.separator)[1]) { //if the user is the creator of the project
				file_handler.delete_path(folderName)
				db_handler.delete_project_owned_by_user_from_all(folderName)

				//updating the project explorer in all the users
				socket.broadcast.emit('update-projects-list')
				socket.emit('update-projects-list')
				emitToUsersInProject(socket.id, "error", `project ${folderName.split(file_handler.separator)[0]} by ${socToDits[socket.id].user.name} has been deleted`)
			}
			else { //just remove his project privileges
				db_handler.delete_project_priv_from_user(folderName, userId)

				let ownedProjectNames = db_handler.get_all_projects_owned_by_user(socToDits[socket.id].user.id);
				let projectsDits = file_handler.get_all_projects_by_names(ownedProjectNames)
				socket.emit('get-projects-list', projectsDits)
			}

		}
		catch (err) {
			errorHandler(err, socket, 'delete-project')
		}
	})

	socket.on('rename-project', (fullOldFolderName, newFolderName) => {
		try {
			let fullNewFolderName = newFolderName + file_handler.separator + fullOldFolderName.split(file_handler.separator)[1];
			file_handler.rename_object(fullOldFolderName, fullNewFolderName)
			db_handler.rename_project_in_all_users(fullOldFolderName, fullNewFolderName)


			const fileTree = file_handler.get_all_project_files_names(fullNewFolderName)

			//ugly ass project field updating to all the users that are working on the project bt Lioriks. :D
			for (let userSoc in socToDits) {
				if (socToDits[userSoc].project == fullOldFolderName) {
					socToDits[userSoc].project = fullNewFolderName;
					soc.to(`${userSoc}`).emit("get-project-file-tree", fileTree);
				}
			}

			socket.broadcast.emit('update-projects-list')
			socket.emit('update-projects-list')
		}
		catch (err) {
			errorHandler(err, socket, 'rename-project')
		}
	})

	socket.on('clone-project', projectId => {
		try {
			file_handler.clone_project(projectId.split(file_handler.separator)[0], socToDits[socket.id].user.id);

			//updating the users project explorer
			socket.broadcast.emit('update-projects-list')
		}
		catch (err) {
			errorHandler(err, socket, 'clone-project')
		}
	})

	socket.on('delete-path', (path) => {
		try {
			file_handler.delete_path(path)
			emitToUsersInProject(socket.id, 'delete-path', path)

		}
		catch (err) {
			errorHandler(err, socket, 'delete-path')
		}
	})

	socket.on('rename-path', pathData => {
		try {
			file_handler.rename_object(pathData.objectPath, pathData.newName)
			const fileTree = file_handler.get_all_project_files_names(socToDits[socket.id].project)

			for (let userSoc in socToDits) {
				if (path.join(socToDits[userSoc].project, socToDits[userSoc].file).includes(pathData.objectPath)) {
					soc.to(`${userSoc}`).emit('kick-from-file', "");
				}
			}


			emitToUsersInProject(socket.id, 'get-project-file-tree', fileTree)
			socket.emit('get-project-file-tree', fileTree)
		}
		catch (err) {
			errorHandler(err, socket, 'rename-path')
		}
	})

	socket.on('file-tree-move-item', (data) => {
		file_handler.move_object(data.oldPath, data.newPath)
		const fileTree = file_handler.get_all_project_files_names(socToDits[socket.id].project)

		for (let userSoc in socToDits) {
			if (path.join(socToDits[userSoc].project, socToDits[userSoc].file).includes(data.oldPath)) {
				soc.to(`${userSoc}`).emit('kick-from-file', "");
			}
		}


		emitToUsersInProject(socket.id, 'get-project-file-tree', fileTree)
		socket.emit('get-project-file-tree', fileTree)

	})





	socket.on('create-project', projectName => {
		try {
			file_handler.create_new_project(projectName, socToDits[socket.id].user);


			socToDits[socket.id].file = ""
			socToDits[socket.id].project = projectName + file_handler.separator + socToDits[socket.id].user.id;



			db_handler.add_project_to_user(socToDits[socket.id].user.id, socToDits[socket.id].project)

			const fileTree = file_handler.get_all_project_files_names(socToDits[socket.id].project)

			let code = makeid()
			codeToProject[code] = socToDits[socket.id].project
			socket.emit('generate-project-code', code)

			socket.emit('get-project-file-tree', fileTree)

		}
		catch (err) {
			errorHandler(err, socket, 'create-project')
		}
	})

	socket.on("get-projects-list", () => {
		try {
			let ownedProjectNames = db_handler.get_all_projects_owned_by_user(socToDits[socket.id].user.id);
			socket.emit('get-projects-list', file_handler.get_all_projects_by_names(ownedProjectNames));
			//socket.emit('get-projects-list', file_handler.get_all_projects_by_names([]));
		} catch (err) { errorHandler(err, socket, "get-projects-list") }

	})

	socket.on('user-left-file', () => {
		try {
			socToDits[socket.id].file = ""
			socToDits[socket.id].pos = defaultPos
			socket.broadcast.emit('user-left-file', socToDits[socket.id].user);
		}
		catch (err) {
			errorHandler(err, socket, 'user-left-file')
		}
	})

	socket.on('enter-project', (code) => {
		let projectName = codeToProject[code];
		if (projectName != undefined) {
			db_handler.add_project_to_user(socToDits[socket.id].user.id, projectName)
		}
		else {
			projectName = false
		}
		socket.emit('enter-project', projectName)

	})

	socket.on("get-users-in-project", () => {
		try {
			let temp = []
			for (let userSoc in socToDits) {

				if (isInTheSameproject(socket.id, userSoc)) {
					temp.push(socToDits[userSoc].user)
				}
			}
			socket.emit("get-users-in-project", temp);
			//&& socToDits[userSoc].user.id != socToDits[socket.id].user.id
		}
		catch (err) {
			errorHandler(err, socket, "get-users-in-project")
		}
	})

	socket.on("relode-user-in-project", () => {
		try {
			emitToUsersInProject(socket, 'relode-user-in-project')
		}
		catch (err) {
			errorHandler(err, socket, "relode-user-in-project")
		}
	})

	socket.on("user-left-project", () => {
		try {
			socToDits[socket.id].file = ""
			socToDits[socket.id].project = ""
			socToDits[socket.id].pos = defaultPos
			emitToUsersInProject(socket, 'relode-user-in-project')
		}
		catch (err) {
			errorHandler(err, socket, "user-left-project")
		}
	})

	socket.on("logout", () => {
		try {

			console.log(`[!] ${socToDits[socket.id].user.fullName} logged out`);
			socket.broadcast.emit('user-left-file', socToDits[socket.id].user);
			delete socToDits[socket.id];
		}
		catch (err) { }

	})


	socket.on('disconnect', () => {
		try {
			console.log(`[!] ${socToDits[socket.id].user.fullName} disconnected`);
			socket.broadcast.emit('user-left-file', socToDits[socket.id].user);
			delete socToDits[socket.id];
		}
		catch (err) { }
	})

})


function getFullPath(data, project_name) {
	if (data.path.split(project_name + "/").length != 1) {
		return data.path.split(project_name + "/")[1] + "/" + data.name
	}
	else {
		return data.name
	}
}

function getUsersPosInFile(fileName) {
	let users = {};
	for (let userSoc in socToDits) {
		if (socToDits[userSoc].file == fileName) {
			users[socToDits[userSoc].user.id] = { pos: socToDits[userSoc].pos, user: socToDits[userSoc].user };
		}
	}
	return users;
}

function emitToUsersInProject(mySoc, tag, msg) {
	for (let userSoc in socToDits) {
		if (isInTheSameproject(mySoc, userSoc) && socToDits[userSoc].user.id != socToDits[mySoc].user.id) {
			soc.to(`${userSoc}`).emit(tag, msg);
		}
	}
}

function emitToUsersInFile(mySoc, tag, msg) {
	for (let userSoc in socToDits) {
		if (isInTheSameFile(mySoc, userSoc) && socToDits[userSoc].user.id != socToDits[mySoc].user.id) {
			soc.to(`${userSoc}`).emit(tag, msg);
		}
	}
}

function isInTheSameproject(socId1, socId2) {
	return socToDits[socId1].project == socToDits[socId2].project
}

function isInTheSameFile(socId1, socId2) {
	return socToDits[socId1].project == socToDits[socId2].project && socToDits[socId1].file == socToDits[socId2].file
}



/*
Function inserts the given text in the current index and updates the given file.
*/
async function updateFile(folder_name, file_name, text, start, end) {
	await fileLock.acquire();
	let file_data = file_handler.get_file_contents(folder_name, file_name);

	let startindex = find_file_index(file_data, start);
	let endindex = find_file_index(file_data, end);

	let updated_file_data = file_data.slice(0, startindex) + text + file_data.slice(endindex);
	file_handler.set_file_contents(folder_name, file_name, updated_file_data);

	fileLock.release();
}

function find_file_index(file_data, pos) {
	let index = 0;


	let list = file_data.split('\n');


	for (let i = 0; i < pos.line; i++) {
		index += list[i].length + 1;
	}

	return index + pos.ch;
}

function makeid() {
	let length = 5;
	var result = '';
	var characters = 'ABCDEFGHJKMNOPQRSTUVWXYZ0123456789';
	var charactersLength = characters.length;
	for (var i = 0; i < length; i++) {
		result += characters.charAt(Math.floor(Math.random() * charactersLength));
	}

	if (Object.keys(codeToProject).includes(result)) { //generate new id if already exists
		return makeid();
	}
	return result;
}

function print_pos(pos) {
	return `{"line":${pos.line}, "ch":${pos.ch}}`;
}

function print_msg(msg) {
	return `{"payload":${msg.payload}, "start":${print_pos(msg.start)}, "end":${print_pos(msg.end)}}`;
}

function deleteUsersCopy(id, socket) {
	for (let userSoc in socToDits) {
		if (socToDits[userSoc].user.id == id && userSoc != socket.id) {
			socket.broadcast.emit('user-left-project', socToDits[userSoc].user);
			soc.to(`${userSoc}`).emit('force-logout')
			delete socToDits[userSoc];
		}
	}
}