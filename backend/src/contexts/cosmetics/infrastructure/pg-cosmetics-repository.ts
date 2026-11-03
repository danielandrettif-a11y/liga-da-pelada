import type { Pool, PoolClient } from "pg";
import { withAuthenticatedTransaction } from "../../../infrastructure/authenticated-transaction.js";
import type { CosmeticsRepository } from "../application/manage-cosmetics.js";
import { emptyEquippedSummary, mapEquippedRow, type CosmeticItem, type CosmeticPreviewLoadout,
  type CosmeticSlot, type EquippedCosmeticsSummary } from "../domain/cosmetics.js";

const LOADOUT_SELECT = `SELECT loadout.user_id,frame.asset_key frame_key,aura.asset_key aura_key,title.name title_name,
 banner.asset_key banner_key,nameplate.asset_key nameplate_key,background.asset_key background_key,
 showcase.asset_key showcase_key,pitch.asset_key pitch_key FROM public.account_cosmetic_loadouts loadout
 LEFT JOIN public.fantasy_cosmetics frame ON frame.id=loadout.frame_cosmetic_id
 LEFT JOIN public.fantasy_cosmetics aura ON aura.id=loadout.aura_cosmetic_id
 LEFT JOIN public.fantasy_cosmetics title ON title.id=loadout.title_cosmetic_id
 LEFT JOIN public.fantasy_cosmetics banner ON banner.id=loadout.banner_cosmetic_id
 LEFT JOIN public.fantasy_cosmetics nameplate ON nameplate.id=loadout.nameplate_cosmetic_id
 LEFT JOIN public.fantasy_cosmetics background ON background.id=loadout.background_cosmetic_id
 LEFT JOIN public.fantasy_cosmetics showcase ON showcase.id=loadout.showcase_cosmetic_id
 LEFT JOIN public.fantasy_cosmetics pitch ON pitch.id=loadout.pitch_cosmetic_id`;

function cosmetic(row: any): CosmeticItem { return { id: row.id, slug: row.slug, slot: row.slot, rarity: row.rarity,
  name: row.name, description: row.description || "", assetKey: row.asset_key }; }

export class PgCosmeticsRepository implements CosmeticsRepository {
  constructor(private readonly pool: Pool) {}
  private withUser<T>(userId: string, operation: (client: PoolClient) => Promise<T>) {
    return withAuthenticatedTransaction(this.pool, { userId }, operation);
  }

  async getCosmeticsDashboard(params: { userId: string; leagueId: string; seasonId: string | null }) {
    return this.withUser(params.userId, async (client) => {
      const admin = Boolean((await client.query("SELECT public.is_app_admin() allowed")).rows[0]?.allowed);
      const fantasySeason = params.seasonId ? await client.query<{ id: string }>(
        "SELECT id FROM public.fantasy_seasons WHERE league_id=$1::uuid AND season_id=$2::uuid LIMIT 1",
        [params.leagueId, params.seasonId]) : { rows: [] };
      const fantasySeasonId = fantasySeason.rows[0]?.id || null;
      const [owned, catalog, rewards, choices, loadout, pass, shop] = await Promise.all([
        client.query<any>(`SELECT owned.cosmetic_id,owned.source_reward_id,row_to_json(item) cosmetic
          FROM public.fantasy_user_cosmetics owned JOIN public.fantasy_cosmetics item ON item.id=owned.cosmetic_id
          WHERE owned.user_id=$1::uuid`, [params.userId]),
        client.query<any>("SELECT * FROM public.fantasy_cosmetics ORDER BY created_at"),
        fantasySeasonId ? client.query<any>(`SELECT reward.id,reward.house,reward.reward_key,reward.reward_type,reward.card_tier,
          row_to_json(bonus) bonus,COALESCE(jsonb_agg(jsonb_build_object('cosmetic',row_to_json(option_item)))
          FILTER (WHERE option_item.id IS NOT NULL),'[]'::jsonb) options
          FROM public.fantasy_season_pass_rewards reward LEFT JOIN public.fantasy_cosmetics bonus ON bonus.id=reward.bonus_cosmetic_id
          LEFT JOIN public.fantasy_season_pass_reward_options option_row ON option_row.reward_id=reward.id
          LEFT JOIN public.fantasy_cosmetics option_item ON option_item.id=option_row.cosmetic_id
          WHERE reward.fantasy_season_id=$1::uuid GROUP BY reward.id,bonus.id ORDER BY reward.house`, [fantasySeasonId]) : Promise.resolve({ rows: [] }),
        fantasySeasonId ? client.query<any>(`SELECT choice.reward_id,choice.cosmetic_id
          FROM public.fantasy_user_cosmetic_reward_choices choice JOIN public.fantasy_season_pass_rewards reward
          ON reward.id=choice.reward_id AND reward.fantasy_season_id=$1::uuid WHERE choice.user_id=$2::uuid`, [fantasySeasonId, params.userId]) : Promise.resolve({ rows: [] }),
        client.query<any>("SELECT * FROM public.account_cosmetic_loadouts WHERE user_id=$1::uuid", [params.userId]),
        fantasySeasonId ? client.query<any>(`SELECT progress,total_progress_points,shop_bonus_points FROM public.fantasy_season_passes
          WHERE fantasy_season_id=$1::uuid AND user_id=$2::uuid`, [fantasySeasonId, params.userId]) : Promise.resolve({ rows: [] }),
        fantasySeasonId ? client.query<any>(`SELECT shop.id,shop.price_points,shop.purchased_at,shop.source_reward_id,row_to_json(item) cosmetic
          FROM public.fantasy_season_pass_shop_items shop JOIN public.fantasy_cosmetics item ON item.id=shop.cosmetic_id
          WHERE shop.fantasy_season_id=$1::uuid AND shop.user_id=$2::uuid ORDER BY shop.listed_at`, [fantasySeasonId, params.userId]) : Promise.resolve({ rows: [] }),
      ]);
      const choicesByReward = new Map(choices.rows.map((row: any) => [row.reward_id, row.cosmetic_id]));
      const ownedByReward = new Map<string, Set<string>>();
      for (const row of owned.rows) if (row.source_reward_id && row.cosmetic_id) { const ids = ownedByReward.get(row.source_reward_id) || new Set<string>(); ids.add(row.cosmetic_id); ownedByReward.set(row.source_reward_id, ids); }
      const passRow=pass.rows[0]||{}, progress=Number(passRow.progress||0), total=Number(passRow.total_progress_points||progress), bonus=Number(passRow.shop_bonus_points||0);
      const spent=shop.rows.filter((row:any)=>row.purchased_at).reduce((sum:number,row:any)=>sum+Number(row.price_points||0),0), selected=loadout.rows[0]||{};
      const rewardHouse = new Map(rewards.rows.map((row:any)=>[row.id,Number(row.house||0)]));
      return { available:true,seasonId:fantasySeasonId,cosmetics:owned.rows.map((row:any)=>cosmetic(row.cosmetic)),
        previewCatalog:admin?catalog.rows.map(cosmetic).filter((item:CosmeticItem)=>!(item.slot==="frame"&&["frame-alambrado","frame-rede","frame-neon","frame-capitao","frame-linha-lateral","frame-grama-raiz"].includes(item.assetKey.toLowerCase()))):[],
        rewards:rewards.rows.filter((row:any)=>row.reward_key!=="pass-shop-pitch-40").map((row:any)=>({id:row.id,house:Number(row.house),rewardType:row.reward_type,cardTier:row.card_tier,
          selectedCosmeticId:choicesByReward.get(row.id)||(row.options||[]).map((option:any)=>option.cosmetic?.id).find((id:string)=>id&&ownedByReward.get(row.id)?.has(id))||null,
          bonusCosmetic:row.bonus?cosmetic(row.bonus):null,options:(row.options||[]).map((option:any)=>option.cosmetic).filter(Boolean).map(cosmetic)})),
        equipped:{banner:selected.banner_cosmetic_id||null,frame:selected.frame_cosmetic_id||null,title:selected.title_cosmetic_id||null,aura:selected.aura_cosmetic_id||null,
          nameplate:selected.nameplate_cosmetic_id||null,background:selected.background_cosmetic_id||null,showcase:selected.showcase_cosmetic_id||null,pitch:selected.pitch_cosmetic_id||null},canPreviewAll:admin,
        shop:{totalProgressPoints:total,bonusPoints:bonus,extraPointsEarned:Math.max(0,total-40)+bonus,spentPoints:spent,balancePoints:Math.max(0,Math.max(0,total-40)+bonus-spent),
          isUnlocked:progress>=40,hasStarted:shop.rows.length>0,purchasedItems:shop.rows.filter((row:any)=>row.purchased_at).length,
          items:shop.rows.filter((row:any)=>!row.purchased_at).map((row:any)=>({id:row.id,pricePoints:Number(row.price_points),cosmetic:cosmetic(row.cosmetic),sourceHouse:rewardHouse.get(row.source_reward_id)||0}))} };
    });
  }

  equipCosmetic(params:{userId:string;slot:CosmeticSlot;cosmeticId:string|null}){return this.withUser(params.userId,async client=>{try{await client.query("SELECT public.equip_account_cosmetic($1::text,$2::uuid)",[params.slot,params.cosmeticId]);return{success:true};}catch(error){return{success:false,error:this.message(error)};}});}
  claimPassCosmetic(params:{userId:string;rewardId:string;cosmeticId:string;fantasySeasonId:string}){return this.withUser(params.userId,async client=>{const scoped=await client.query("SELECT 1 FROM public.fantasy_season_pass_rewards WHERE id=$1::uuid AND fantasy_season_id=$2::uuid",[params.rewardId,params.fantasySeasonId]);if(!scoped.rowCount)return{success:false,error:"Recompensa não pertence à pelada selecionada."};try{await client.query("SELECT public.claim_fantasy_pass_cosmetic($1::uuid,$2::uuid)",[params.rewardId,params.cosmeticId]);return{success:true};}catch(error){return{success:false,error:this.message(error)};}});}
  purchaseSeasonPassShopItem(params:{userId:string;shopItemId:string;fantasySeasonId:string}){return this.withUser(params.userId,async client=>{const scoped=await client.query("SELECT 1 FROM public.fantasy_season_pass_shop_items WHERE id=$1::uuid AND fantasy_season_id=$2::uuid AND user_id=$3::uuid",[params.shopItemId,params.fantasySeasonId,params.userId]);if(!scoped.rowCount)return{success:false,error:"Item não pertence à pelada selecionada."};try{await client.query("SELECT public.purchase_fantasy_pass_shop_item($1::uuid)",[params.shopItemId]);return{success:true};}catch(error){return{success:false,error:this.message(error)};}});}
  getMyEquippedCosmetics(userId:string){return this.withUser(userId,client=>this.readLoadout(client,userId));}
  getPlayerEquippedCosmetics(playerId:string,userId:string){return this.withUser(userId,async client=>{const profile=await client.query<{user_id:string}>("SELECT user_id FROM public.account_profiles WHERE player_id=$1::uuid",[playerId]);return profile.rows[0]?this.readLoadout(client,profile.rows[0].user_id):null;});}
  getAllPlayersEquippedCosmeticsMap(playerIds:string[]|undefined,userId:string){return this.withUser(userId,async client=>{if(playerIds?.length===0)return{};const profiles=await client.query<any>("SELECT player_id,user_id FROM public.account_profiles WHERE player_id IS NOT NULL AND ($1::uuid[] IS NULL OR player_id=ANY($1::uuid[]))",[playerIds||null]);const result:Record<string,EquippedCosmeticsSummary>={};for(const row of profiles.rows){const value=await this.readLoadout(client,row.user_id);if(value)result[row.player_id]=value;}return result;});}
  resolveAdminCosmeticsPreview(params:{userId:string;playerId:string;requested:CosmeticPreviewLoadout}){return this.withUser(params.userId,async client=>{const allowed=await client.query("SELECT 1 FROM public.account_profiles WHERE user_id=$1::uuid AND player_id=$2::uuid AND public.is_app_admin()",[params.userId,params.playerId]);if(!allowed.rowCount||!params.requested||Array.isArray(params.requested))return null;const selections=Object.entries(params.requested).filter(([slot,id])=>["banner","frame","title","aura","nameplate","background","showcase","pitch"].includes(slot)&&typeof id==="string"&&id.length>0);if(!selections.length)return null;const items=await client.query<any>("SELECT id,slot,asset_key,name FROM public.fantasy_cosmetics WHERE id=ANY($1::uuid[])",[selections.map(([,id])=>id)]),byId=new Map(items.rows.map((row:any)=>[row.id,row])),preview=emptyEquippedSummary();for(const[slot,id]of selections){const item:any=byId.get(id);if(!item||item.slot!==slot)continue;if(slot==="frame")preview.frameKey=item.asset_key;if(slot==="aura")preview.auraKey=item.asset_key;if(slot==="title")preview.titleName=item.name;if(slot==="banner")preview.bannerAssetKey=item.asset_key;if(slot==="nameplate")preview.nameplateKey=item.asset_key;if(slot==="background")preview.backgroundAssetKey=item.asset_key;if(slot==="showcase")preview.showcaseAssetKey=item.asset_key;if(slot==="pitch")preview.pitchAssetKey=item.asset_key;}return preview;});}
  cleanupLegacyCosmeticsPreview(userId:string,seasonId:string|null){return this.adminCount(userId,seasonId,"cleanup_my_cosmetics_preview","removed");}
  dismissUnopenedBronzePassPack(userId:string,seasonId:string|null){return this.adminCount(userId,seasonId,"dismiss_my_unopened_bronze_pass_pack","dismissed");}
  resetTestPassRewardClaims(params:{userId:string;fantasySeasonId:string;selectedFantasySeasonId:string|null}){if(params.fantasySeasonId!==params.selectedFantasySeasonId)return Promise.resolve({success:false,error:"Passe não pertence à pelada selecionada."});return this.adminCount(params.userId,params.fantasySeasonId,"reset_my_test_pass_cosmetic_claims","removed");}
  private async readLoadout(client:PoolClient,userId:string){const result=await client.query<any>(`${LOADOUT_SELECT} WHERE loadout.user_id=$1::uuid`,[userId]);return result.rows[0]?mapEquippedRow(result.rows[0]):null;}
  private async adminCount(userId:string,seasonId:string|null,rpc:string,key:"removed"|"dismissed"){if(!seasonId)return{success:false,error:"Passe da pelada selecionada não encontrado."};return this.withUser(userId,async client=>{try{const result=await client.query<any>(`SELECT public.${rpc}($1::uuid) count`,[seasonId]);return{success:true,[key]:Number(result.rows[0]?.count||0)};}catch(error){return{success:false,error:this.message(error)};}});}
  private message(error:unknown){return error instanceof Error?error.message:"Operação de cosmético inválida.";}
}
