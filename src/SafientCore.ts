import { IDX } from '@ceramicstudio/idx';
import { Client, PrivateKey, ThreadID, Where } from '@textile/hub';
import { getThreadId } from './utils/threadDb';
import {generateIDX} from './lib/identity'
import {generateSignature} from './lib/signer'
// @ts-ignore
import shamirs from 'shamirs-secret-sharing';
import { Connection, User, UserBasic, Users, SafeData, Shard } from './types/types';
import {definitions} from "./utils/config.json"
import {utils} from "./lib/helpers"
import { JWE } from 'did-jwt';
import { decryptData } from './utils/aes';
import { JsonRpcProvider, JsonRpcSigner, TransactionResponse } from '@ethersproject/providers';
import {SafientClaims} from "@safient/claims"
import {ethers} from "ethers"
require('dotenv').config();

const safeStages = {
  "ACTIVE" : 0,
  "CLAIMING": 1,
  "RECOVERING": 2,
  "RECOVERED": 3,
  "CLAIMED": 4
}

const claimStages = {
    "ACTIVE": 0,
    "PASSED": 1,
    "FAILED": 2,
    "REJECTED": 3
}
export class SafientCore {
  private signer: JsonRpcSigner;
  private utils: utils;
  private provider: JsonRpcProvider;
  private claims: SafientClaims


  constructor(signer: JsonRpcSigner, chainId: number) {
    this.signer = signer;
    this.utils = new utils();
    this.provider = this.provider
    this.claims = new SafientClaims(signer, chainId)
  }

  /**
   * API 1:connectUser 
   *
   */
  connectUser = async (): Promise<Connection> => {
    const seed = await generateSignature(this.signer) 
    console.log(seed)
    const {idx, ceramic} = await generateIDX(Uint8Array.from(seed))
    const identity = PrivateKey.fromRawEd25519Seed(Uint8Array.from(seed));
    const client = await Client.withKeyInfo({
      key: `${process.env.USER_API_KEY}`,
      secret: `${process.env.USER_API_SECRET}`,
    });
    await client.getToken(identity);
    const threadId = ThreadID.fromBytes(Uint8Array.from(await getThreadId()));
    return { client, threadId, idx };
  };

  /**
   * API 2:registerUser 
   *
   */

  registerNewUser = async (
    conn: Connection,
    name: string,
    email: string,
    signUpMode: number,
    userAddress: string
  ): Promise<string> => {
    try {
      let idx: IDX | null = conn.idx
      let did: string = idx?.id || ''
      const data = {
        did,
        name,
        email,
        safes: [],
        signUpMode,
        userAddress
      };

      //get the threadDB user
      const query = new Where('email').eq(email);
      const result: User[] = await conn.client.find(conn.threadId, 'Users', query);

      if (result.length < 1) {
        const ceramicResult = await idx?.set(definitions.profile, {
          name: name,
          email: email
        })
        const newUser = await conn.client.create(conn.threadId, 'Users', [data]);
        return newUser[0];
      } else {
        throw new Error(`${email} already exists!`);
      }
    } catch (err) {
      throw new Error(err);
    }
  };

  /**
   * API 3:getLoginUser 
   *
   */
  getLoginUser = async (conn: Connection, did:string): Promise<User> => {
    try {

      const query = new Where('did').eq(did);
      const result: User[] = await conn.client.find(conn.threadId, 'Users', query);

      if (result.length < 1) {
        throw new Error(`${did} is not registered!`);
      } else {
        return result[0];
      }
    } catch (err) {
      throw new Error(err);
    }
  };


  /**
   * API 4:getAllUsers 
   *
   */

  getAllUsers = async (conn: Connection): Promise<Users> => {
    try {
      const registeredUsers: User[] = await conn.client.find(conn.threadId, 'Users', {});

      let caller: UserBasic | string = conn.idx?.id || '';
      let userArray: UserBasic[] = [];

      for (let i = 0; i < registeredUsers.length; i++) {
        const result = registeredUsers[i];
        const value: UserBasic = {
          name: result.name,
          email: result.email,
          did: result.did,
        };

        value.did.toLowerCase() === result.did.toLowerCase() ? (caller = value) : (caller = `${value.did} is not registered!`);

        userArray.push(value);
      }

      return {
        userArray,
        caller,
      };
    } catch (err) {
      throw new Error(err);
    }
  };

   /**
   * API 5:randomGuardians 
   *
   */
  private randomGuardians = async (conn: Connection, creatorDID: string | any, inheritorDID: string | any): Promise<string[]> => {
    const users: User[] = await conn.client.find(conn.threadId, 'Users', {});
    let guardians: string[] = [];
    let guardianIndex = 0;

    while (guardianIndex <= 2) {
      const index = Math.floor(Math.random() * users.length);

      let randomGuardian = users[index];

      if (
        creatorDID !== randomGuardian.did &&
        inheritorDID !== randomGuardian.did &&
        !guardians.includes(randomGuardian.did)
      ) {
        guardians.push(randomGuardian.did);
        guardianIndex = guardianIndex + 1;
      } else {
        guardianIndex = guardians.length;
      }
    }
    return guardians;
  };

  createNewSafe = async (
    creator: Connection,
    inheritor: Connection,
    creatorDID: string,
    inheritorDID:string,
    safeData: any,
    onChain?: boolean
  ): Promise<Object> => {
    try {
        let guardians: User[] = [];
        let txReceipt
      //get randomGuardians

        const creatorQuery = new Where('did').eq(creatorDID)
        const inheritorQuery = new Where('did').eq(inheritorDID)
        let creatorUser:User[]  = await creator.client.find(creator.threadId, 'Users', creatorQuery)
        let recipientUser: User[] = await creator.client.find(creator.threadId, 'Users', inheritorQuery)



           // Step 1: Create safe on ThreadDB
          const guardiansDid: string[] = await this.randomGuardians(creator, creator.idx?.id, inheritor.idx?.id);

          const guardianOne: User = await this.getLoginUser(creator, guardiansDid[0]);
          const guardianTwo: User = await this.getLoginUser(creator, guardiansDid[1]);
          const guardianThree: User = await this.getLoginUser(creator, guardiansDid[2]);

          guardians = [guardianOne, guardianTwo, guardianThree]
    
          //GenerateRecoveryProof
          const recoveryProofData = this.utils.generateRecoveryMessage(guardians);
          const signature: string = await this.signer.signMessage(ethers.utils.arrayify(recoveryProofData.hash));
          

        //   const Sharedata: Object = {
        //     inheritorEncKey: encryptedSafeData.inheritorEncKey
        //     message : JSON.parse(recoveryProofData.recoveryMessage),
        //     signature: signature
        // }
          
          //Get the encryptedData
          const encryptedSafeData = await this.utils.generateSafeData(
            safeData, 
            inheritor.idx?.id, 
            creator.idx?.id, 
            creator, 
            guardiansDid, 
            signature, 
            recoveryProofData.recoveryMessage,
            recoveryProofData.secrets
            )
          //
    
    
          const data: SafeData = {
            creator: creator.idx?.id,
            guardians: guardiansDid,
            recipient: inheritor.idx?.id,
            encSafeKey: encryptedSafeData.creatorEncKey,
            encSafeData: encryptedSafeData.encryptedData,
            stage: safeStages.ACTIVE,
            encSafeKeyShards: encryptedSafeData.shardData,
            claims: []
          };
    
          const safe = await creator.client.create(creator.threadId, 'Safes', [data])


    
          
      if(onChain === true){

        //create metadata
        const metaDataEvidenceUri:string = await this.utils.createMetaData('0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512', creatorUser[0].userAddress);

        //get arbitration fee and guardianfee
        const arbitrationFee: number = await this.claims.arbitrator.getArbitrationFee()
        console.log(arbitrationFee)
        //Default 0.1, need to be able to get it from developer
        const guardianFee: number = 0.1;


        const totalFee: string = String(ethers.utils.parseEther(String(arbitrationFee + guardianFee)))
        //onChain transaction 

        const tx: TransactionResponse = await this.claims.safientMain.createSafe(recipientUser[0].userAddress, safe[0], metaDataEvidenceUri, totalFee)
        txReceipt = await tx.wait();
        console.log(txReceipt)
      }

      if(txReceipt?.status === 1 || onChain === false){
              if (creatorUser[0].safes.length===0) {
                creatorUser[0].safes = [{
                    safeId: safe[0],
                    type: 'creator'
                }]
            }else {
                creatorUser[0].safes.push({
                    safeId: safe[0],
                    type: 'creator'
                })
            }
        
            if (recipientUser[0].safes.length===0) {
                recipientUser[0].safes = [{
                    safeId: safe[0],
                    type: 'inheritor'
                }]
            }else {
                recipientUser[0].safes.push({
                    safeId: safe[0],
                    type: 'inheritor'
                })
            }
        
            guardians?.map(guardian => {
              if(guardian.safes.length===0){
                guardian.safes = [{
                  safeId: safe[0],
                  type: 'guardian'
                }]
              }else{
                guardian.safes.push({
                  safeId: safe[0],
                  type: 'guardian'
              })
              }
            })
        
            await creator.client.save(creator.threadId,'Users',[creatorUser[0]])
            await creator.client.save(creator.threadId,'Users',[recipientUser[0]])
        
            guardiansDid.forEach((async(guardians, index) => {
              await creator.client.save(creator.threadId,'Users',[guardians[index]])
            })); 
      }

      //Issue 01: Have a onChain flag on the user profile and if the onChain is successful, update the flag or if unsuccessful update the flag
      else{
        await creator.client.delete(creator.threadId, 'Users', [safe[0]] );
      }

    return safe[0];

    } catch (err) {
      throw new Error(err);
    }
  };

  getSafeData = async (conn: Connection, safeId: string): Promise<SafeData> => {
    try {
      const query = new Where('_id').eq(safeId);
      const result: SafeData[] = await conn.client.find(conn.threadId, 'Safes', query);
      return result[0];
    } catch (err) {
      throw new Error(err);
    }
  };

  claimSafe = async (conn: Connection, safeId: string, disputeId: number): Promise<boolean> => {
    try {
      const query = new Where('_id').eq(safeId);
      const result: SafeData[] = await conn.client.find(conn.threadId, 'Safes', query);

      if(result[0].stage === safeStages.ACTIVE){
        result[0].stage = safeStages.CLAIMING
        if( result[0].claims.length === 0 || result[0].claims === undefined){
            result[0].claims = [{
                "createdBy": conn.idx?.id,
                "claimStatus": claimStages.ACTIVE,
                "disputeId": disputeId
            }]
        }else{
            result[0].claims.push({
              "createdBy": conn.idx?.id,
              "claimStatus": claimStages.ACTIVE,
              "disputeId": disputeId
            })
        }
       
    }

      await conn.client.save(conn.threadId, 'Safes', [result[0]]);

      return true;
    } catch (err) {
      throw new Error(err);
    }
  };

  decryptShards = async (conn: Connection, safeId: string, did: string): Promise<boolean> => {
    try {
      const query = new Where('_id').eq(safeId);
      const result: SafeData[] = await conn.client.find(conn.threadId, 'Safes', query);
      
      const indexValue = result[0].guardians.indexOf(did)
      
      if(result[0].stage === safeStages.ACTIVE) {
        result[0].stage = safeStages.RECOVERING
      }

      const decShard = await conn.idx?.ceramic.did?.decryptDagJWE(
          result[0].encSafeKeyShards[indexValue].encShard
        )
      result[0].encSafeKeyShards[indexValue].status = 1
      result[0].encSafeKeyShards[indexValue].decData = decShard

      await conn.client.save(conn.threadId,'Safes',[result[0]])
      
      return true;
      } catch (err) {
      throw new Error(err);
    }
  };

  decryptSafeData = async(conn: Connection, safeId: string): Promise<any> =>{
        const safeData:SafeData = await this.getSafeData(conn, safeId);
        const encSafeData = safeData.encSafeData
        const aesKey = await conn.idx?.ceramic.did?.decryptDagJWE(safeData.encSafeKey)
        const data = await decryptData(encSafeData, aesKey);
        const reconstructedData = JSON.parse(data.toString());
        return reconstructedData;
      }



      recoverData = async (conn: Connection, safeId: string, did: string): Promise<boolean> => {
        try {
          const query = new Where('_id').eq(safeId);
          const result: SafeData[] = await conn.client.find(conn.threadId, 'Safes', query);
          let shards: Object[] = [];

          if(result[0].stage === safeStages.RECOVERING || result[0].stage === safeStages.RECOVERED){
            result[0].stage = safeStages.CLAIMED
          }

          result[0].encSafeKeyShards.map(share => {
            share.status === 1 ? shards.push(share.decData) : null
          })

          const data = await this.utils.reconstructShards(conn, shards,result[0].encSafeData);
         
          return data;
          } catch (err) {
          throw new Error(err);
        }
      };
}
