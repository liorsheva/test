let sqlite = require('sqlite-sync')
const path = require('path');
const cwd = path.parse(process.cwd())

class db_handler_class {

    constructor(path_to_db) {
        this.root_path = path.join(cwd.dir, cwd.name, path_to_db);
        this.seperator = '?'

        sqlite.connect(this.root_path);
        this.create_all_tables()

    }

    error_func(res, command) {
        //if (res.error){
        //    return console.log(command,"\n",res.error,"\n")
        //}
        //else{
        //    return console.log(command,"\n", res.error,"\n")
        //}
    }

    create_all_tables() {
        this.create_table('users', ['id TEXT PRIMARY KEY UNIQUE', 'owned_projects TEXT'])
    }

    create_table(tableName, coloms) {
        let command = `CREATE TABLE IF NOT EXISTS ${tableName} (${coloms.join(", ")});`
        sqlite.run(command, (result) => this.error_func(result, command))
        return 0
    }


    /*Users table functions*/

    add_user(user_id) {
        this.insert_row("users", { id: `"${user_id}"`, "owned_projects": `""` })
    }

    add_project_to_user(user_id, project_id) {
        this.append_to_row("users", { name: "owned_projects", value: project_id }, { name: "id", value: `"${user_id}"` })
    }

    delete_project_priv_from_user(project_id, user_id) {
        this.delete_value_in_field('users', { name: 'owned_projects', value: project_id }, { name: "id", value: `"${user_id}"` })
    }

    delete_project_owned_by_user_from_all(project_id) {
        this.delete_value_in_field('users', { name: 'owned_projects', value: project_id }, { name: 1, value: 1 }) //replace everywhere
    }

    rename_project_in_all_users(project_id, new_project_id) {
        this.replace_value_in_field('users', { name: 'owned_projects', value: project_id, replaceValue: new_project_id }, { name: 1, value: 1 })
    }


    get_all_projects_owned_by_user(user_id) {
        let command = `SELECT * FROM users WHERE id = "${user_id}"`;
        return sqlite.pvSELECT(command)[0].owned_projects.split(this.seperator).filter(x => x)
    }



    /*Projects table functions*/



    /* 
    Create functions when Lior is not watching....
    */




    /* Global table functions*/

    insert_row(tableName, row) {
        let command = `INSERT INTO ${tableName}(${Object.keys(row).join(", ")}) VALUES(${Object.values(row).join(", ")});`
        sqlite.run(command, (result, err) => this.error_func(result, command))

    }
    delete_row(tableName, condition) {
        let command = `DELETE FROM ${tableName} WHERE ${condition.name}=${condition.value};`
        sqlite.run(command, (result, err) => this.error_func(result, command))

    }

    get_row(tableName, condition) {
        let command = `SELECT * FROM ${tableName} WHERE ${condition.name}=${condition.value};`
        return sqlite.pvSELECT(command)

    }

    delete_value_in_field(tableName, field, condition) {
        let command = `UPDATE ${tableName} SET ${field.name} = REPLACE(${field.name}, '${this.seperator + field.value + this.seperator}', '') WHERE ${condition.name}=${condition.value};`

        sqlite.run(command, (result, err) => this.error_func(result, command))

    }

    replace_value_in_field(tableName, field, condition) {
        let command = `UPDATE ${tableName} SET ${field.name} = REPLACE(${field.name}, '${this.seperator + field.value + this.seperator}', '${this.seperator + field.replaceValue + this.seperator}') WHERE ${condition.name}=${condition.value};`
        sqlite.run(command, (result, err) => this.error_func(result, command))

    }

    append_to_row(tableName, field, condition) {
        let command = `UPDATE ${tableName} SET ${field.name} = ${field.name} || '${this.seperator + field.value + this.seperator}' WHERE ${condition.name}=${condition.value};`

        sqlite.run(command, (result, err) => this.error_func(result, command))

    }

}


module.exports = db_handler_class;