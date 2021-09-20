import { Connection, SafeData, User } from '../../types/types';
import { ThreadDB } from '../utils/threadDB';

export class Database {
    
  public db : ThreadDB
  private connection: Connection
  private dbName: string
  
  /**
   * 
   * @param dbName - Database which should be used
   * @param connection - Connection Object of the chosen database
   */
  constructor(dbName: string, connection: Connection) {
      this.dbName = dbName;
      this.connection = connection;

    if(dbName === 'threadDB'){
        this.db= new ThreadDB(connection);
    }else {
        this.db = new ThreadDB(connection);
    }
  }

  /**
   * 
   * @param data - Data that needs to be created
   * @param collection - Collection on which data has to be saved
   * @returns 
   */
  create = async(data: any, collection: string): Promise<string[]> => {
    try{
        let result: string[]
        if(this.dbName === "threadDB"){
            result = await this.db.threadCreate(data, collection)
            return result
        }else{
            result = await this.db.threadCreate(data, collection)
            return result
        }
    }catch(err){
        throw new Error(`Error while creating data, ${err}`)
    }
  }

  save = async(data: any, collection: string): Promise<boolean> => {
    try{
        if(this.dbName === 'threadDB'){
            await this.db.threadSave(data, collection)
            return true
        }else{
            //mongoDB or other
            await this.db.threadSave(data, collection)
            return true
        }
        
    }catch(err){
        throw new Error("Error while saving data")
    }
  }

  delete = async(data: any, collection: string): Promise<boolean> => {
    try{
        if(this.dbName === 'threadDB'){
            await this.db.threadDelete(data, collection);
            return true
        }else{
            await this.db.threadDelete(data, collection);
            return true
        }

    }catch(err){
        throw new Error("Error while deleting data")
    }
  }

  readUser = async(queryVariable: string, queryValue: string): Promise<User[]> => {
    try{
        let result: User[]
        if(this.dbName === 'threadDB'){
            result = await this.db.threadReadUser(queryVariable, queryValue)
            return result
        }else{
            result = await this.db.threadReadUser(queryVariable, queryValue)
            return result
        }

    }catch(err){
        throw new Error("Error while reading user data")
    }
  }

  readAllUsers = async(): Promise<User[]> => {
    try{
        let result: User[]
        if(this.dbName === 'threadDB'){
            result = await this.db.threadReadAllUsers();
            return result
        }else{
            result = await this.db.threadReadAllUsers();
            return result
        }

    }catch(err){
        throw new Error("Error while reading user data")
    }
  }

  readSafe = async(safeId: string): Promise<SafeData[]> => {
    try{
        let result: SafeData[]
        if(this.dbName === 'threadDB'){
            result = await this.db.threadReadSafe(safeId)
            return result
        }else{
            result = await this.db.threadReadSafe(safeId)
            return result
        }

    }catch(err){
        throw new Error("Error while reading user data")
    }
  }
}





















