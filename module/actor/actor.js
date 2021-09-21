import { addShowDicePromise, diceSound, showDice } from "../dice.js";
import ScvmDialog from "../scvm/scvm-dialog.js";

const ATTACK_DIALOG_TEMPLATE = "systems/vastgrimm/templates/dialog/attack-dialog.html";
const ATTACK_ROLL_CARD_TEMPLATE = "systems/vastgrimm/templates/chat/attack-roll-card.html";
const BROKEN_ROLL_CARD_TEMPLATE = "systems/vastgrimm/templates/chat/broken-roll-card.html";
const DEFEND_DIALOG_TEMPLATE = "systems/vastgrimm/templates/dialog/defend-dialog.html";
const DEFEND_ROLL_CARD_TEMPLATE = "systems/vastgrimm/templates/chat/defend-roll-card.html";
const IMPROVE_ROLL_CARD_TEMPLATE = "systems/vastgrimm/templates/chat/improve-roll-card.html";
const MORALE_ROLL_CARD_TEMPLATE = "systems/vastgrimm/templates/chat/morale-roll-card.html";
const OUTCOME_ONLY_ROLL_CARD_TEMPLATE = "systems/vastgrimm/templates/chat/outcome-only-roll-card.html";
const OUTCOME_ROLL_CARD_TEMPLATE = "systems/vastgrimm/templates/chat/outcome-roll-card.html";
const REACTION_ROLL_CARD_TEMPLATE = "systems/vastgrimm/templates/chat/reaction-roll-card.html";
const TEST_ABILITY_ROLL_CARD_TEMPLATE = "systems/vastgrimm/templates/chat/test-ability-roll-card.html";
const WIELD_POWER_ROLL_CARD_TEMPLATE = "systems/vastgrimm/templates/chat/activate-tribute-roll-card.html";

/**
 * @extends {Actor}
 */
export class VGActor extends Actor {
  /** @override */
  static async create(data, options={}) {
    data.token = data.token || {};
    let defaults = {};
    if (data.type === "character") {
      defaults = {
        actorLink: true,
        disposition: 1,
        vision: true,
        dimSight: 30,
        brightSight: 0,
      };
    } else if (data.type === "container") {
      defaults = {
        actorLink: false,
        disposition: 0,
        vision: false,
      };
    } else if (data.type === "creature") {
      defaults = {
        actorLink: false,
        disposition: -1,
        vision: false,
      };
    }
    mergeObject(data.token, defaults, {overwrite: false});
    return super.create(data, options);
  }

  /** @override */
  prepareData() {
    super.prepareData();
  }

  /** @override */
  getRollData() {
    const data = super.getRollData();
    return data;
  }

  _firstEquipped(itemType) {
    for (const item of this.data.items) {
      if (item.type === itemType && item.data.data.equipped) {
        return item;
      }
    }
    return undefined;
  }

  equippedArmor() {
    return this._firstEquipped("armor");
  }

  equippedHelmet() {
    return this._firstEquipped("helmet");
  }

  normalCarryingCapacity() {
    return this.data.data.abilities.strength.value + 8;
  }

  maxCarryingCapacity() {
    return 2 * this.normalCarryingCapacity();
  }

  carryingWeight() {
    let total = 0;
    for (const item of this.data.items) {
      if (CONFIG.VG.itemEquipmentTypes.includes(item.data.type) && item.data.data.weight) {
        const roundedWeight = Math.ceil(item.data.data.weight * item.data.data.quantity);
        total += roundedWeight;
      }
    }
    return total;
  }

  isEncumbered() {
    return this.carryingWeight() > this.normalCarryingCapacity();
  }

  containerSpace() {
    let total = 0;
    for (const item of this.data.items) {
      if (CONFIG.VG.itemEquipmentTypes.includes(item.type) && 
          item.data.type !== 'container' &&
          !item.data.data.equipped &&
          item.data.data.volume) {  
          const roundedSpace = Math.ceil(item.data.data.volume * item.data.data.quantity);
          total += roundedSpace;
      }
    }
    return total;
  }

  containerCapacity() {
    let total = 0;
    for (const item of this.data.items) {
      if (item.data.type === 'container' && item.data.data.capacity) {
        total += item.data.data.capacity;
      }
    }
    return total;
  }

  async _testAbility(ability, abilityKey, drModifiers) {
    let abilityRoll = new Roll(`1d20+@abilities.${ability}.value`, this.getRollData());
    abilityRoll.evaluate({async: false});
    await showDice(abilityRoll);
    const rollResult = {
      abilityKey: abilityKey,
      abilityRoll,
      drModifiers,
    }
    const html = await renderTemplate(TEST_ABILITY_ROLL_CARD_TEMPLATE, rollResult)
    ChatMessage.create({
      content : html,
      sound : diceSound(),
      speaker : ChatMessage.getSpeaker({actor: this}),
    });
  }

  async testStrength() {
    let drModifiers = [];
    if (this.isEncumbered()) {
      drModifiers.push(`${game.i18n.localize('VG.Encumbered')}: ${game.i18n.localize('VG.DR')} +2`);
    }
    await this._testAbility("strength", "VG.AbilityStrength", drModifiers);
  }

  async testAgility() {
    let drModifiers = [];
    const armor = this.equippedArmor();
    if (armor) {
      const armorTier = CONFIG.VG.armorTiers[armor.data.data.tier.max];
      if (armorTier.agilityModifier) {
        drModifiers.push(`${armor.name}: ${game.i18n.localize('VG.DR')} +${armorTier.agilityModifier}`);
      }
    }
    if (this.isEncumbered()) {
      drModifiers.push(`${game.i18n.localize('VG.Encumbered')}: ${game.i18n.localize('VG.DR')} +2`);
    }
    await this._testAbility("agility", "VG.AbilityAgility", drModifiers);
  }

  async testPresence() {
    await this._testAbility("presence", "VG.AbilityPresence", null);
  }

  async testToughness() {
    await this._testAbility("toughness", "VG.AbilityToughness", null);
  }

  /**
   * Attack!
   */
  async attack(itemId) {
    let attackDR = await this.getFlag(CONFIG.VG.flagScope, CONFIG.VG.flags.ATTACK_DR);
    if (!attackDR) {
      attackDR = 12;  // default
    }
    const targetArmor = await this.getFlag(CONFIG.VG.flagScope, CONFIG.VG.flags.TARGET_ARMOR);    
    let dialogData = {
      attackDR,
      config: CONFIG.VG,
      itemId,
      targetArmor
    };
    const html = await renderTemplate(ATTACK_DIALOG_TEMPLATE, dialogData);
    return new Promise(resolve => {
      new Dialog({
         title: game.i18n.localize('VG.Attack'),
         content: html,
         buttons: {
            roll: {
              icon: '<i class="fas fa-dice-d20"></i>',
              label: game.i18n.localize('VG.Roll'),
              // callback: html => resolve(_createItem(this.actor, html[0].querySelector("form")))
              callback: html => this._attackDialogCallback(html)
            },
         },
         default: "roll",
         close: () => resolve(null)
        }).render(true);
    });
  }

  /**
   * Callback from attack dialog.
   */
  async _attackDialogCallback(html) {
    const form = html[0].querySelector("form");
    const itemId = form.itemid.value;
    const attackDR = parseInt(form.attackdr.value);
    const targetArmor = form.targetarmor.value;
    if (!itemId || !attackDR) {
      // TODO: prevent form submit via required fields
      return;
    }
    await this.setFlag(CONFIG.VG.flagScope, CONFIG.VG.flags.ATTACK_DR, attackDR);
    await this.setFlag(CONFIG.VG.flagScope, CONFIG.VG.flags.TARGET_ARMOR, targetArmor);
    this._rollAttack(itemId, attackDR, targetArmor);
  }

  /**
   * Do the actual attack rolls and resolution.
   */
  async _rollAttack(itemId, attackDR, targetArmor) {
    const item = this.items.get(itemId);
    const itemRollData = item.getRollData();
    const actorRollData = this.getRollData();

    // roll 1: attack
    const isRanged = itemRollData.weaponType === 'ranged';
    // ranged weapons use presence; melee weapons use strength
    const ability = isRanged ? 'presence' : 'strength';
    let attackRoll = new Roll(`d20+@abilities.${ability}.value`, actorRollData);
    attackRoll.evaluate({async: false});
    await showDice(attackRoll);

    const d20Result = attackRoll.terms[0].results[0].result;
    const isFumble = (d20Result === 1);
    const isCrit = (d20Result === 20);

    let attackOutcome = null;
    let damageRoll = null;
    let targetArmorRoll = null;
    let takeDamage = null;
    if (attackRoll.total >= attackDR) {
      // HIT!!!
      attackOutcome = game.i18n.localize(isCrit ? 'VG.AttackCritText' : 'VG.Hit');
      // roll 2: damage
      const damageFormula = isCrit ? "@damageDie * 2" : "@damageDie";
      damageRoll = new Roll(damageFormula, itemRollData);
      damageRoll.evaluate({async: false});
      let dicePromises = [];
      addShowDicePromise(dicePromises, damageRoll);
      let damage = damageRoll.total;
      // roll 3: target damage reduction
      if (targetArmor) {
        targetArmorRoll = new Roll(targetArmor, {});
        targetArmorRoll.evaluate({async: false});
        addShowDicePromise(dicePromises, targetArmorRoll);
        damage = Math.max(damage - targetArmorRoll.total, 0);
      }
      if (dicePromises) {
        await Promise.all(dicePromises);
      }
      takeDamage = `${game.i18n.localize('VG.Inflict')} ${damage} ${game.i18n.localize('VG.Damage')}`
    } else {
      // MISS!!!
      attackOutcome = game.i18n.localize(isFumble ? 'VG.AttackFumbleText' : 'VG.Miss');
    }

    // TODO: decide key in handlebars/template?
    const weaponTypeKey = isRanged ? 'VG.WeaponTypeRanged' : 'VG.WeaponTypeMelee';
    const rollResult = {
      actor: this,
      attackDR,
      attackRoll,
      attackOutcome,
      damageRoll,      
      items: [item],
      takeDamage,
      targetArmorRoll,
      weaponTypeKey
    };
    await this._renderAttackRollCard(rollResult);
  }

  /**
   * Show attack rolls/result in a chat roll card.
   */
  async _renderAttackRollCard(rollResult) {
    const html = await renderTemplate(ATTACK_ROLL_CARD_TEMPLATE, rollResult)
    ChatMessage.create({
      content : html,
      sound : diceSound(),
      speaker : ChatMessage.getSpeaker({actor: this}),
    });
  }

  /**
   * Defend!
   */
  async defend() {
    // look up any previous DR or incoming attack value
    let defendDR = await this.getFlag(CONFIG.VG.flagScope, CONFIG.VG.flags.DEFEND_DR);
    if (!defendDR) {
      defendDR = 12;  // default
    }
    let incomingAttack = await this.getFlag(CONFIG.VG.flagScope, CONFIG.VG.flags.INCOMING_ATTACK);
    if (!incomingAttack) {
      incomingAttack = "1d4";  // default
    }

    const armor = this.equippedArmor();
    let drModifiers = [];
    if (armor) {
      // armor defense adjustment is based on its max tier, not current
      // TODO: maxTier is getting stored as a string
      const maxTier = parseInt(armor.data.data.tier.max);
      const defenseModifier = CONFIG.VG.armorTiers[maxTier].defenseModifier;
      if (defenseModifier) { 
        drModifiers.push(`${armor.name}: ${game.i18n.localize('VG.DR')} +${defenseModifier}`);       
      }
    }
    if (this.isEncumbered()) {
      drModifiers.push(`${game.i18n.localize('VG.Encumbered')}: ${game.i18n.localize('VG.DR')} +2`);
    }

    let dialogData = {
      defendDR,
      drModifiers,
      incomingAttack,
    };
    const html = await renderTemplate(DEFEND_DIALOG_TEMPLATE, dialogData);

    return new Promise(resolve => {
      new Dialog({
         title: game.i18n.localize('VG.Defend'),
         content: html,
         buttons: {
            roll: {
              icon: '<i class="fas fa-dice-d20"></i>',
              label: game.i18n.localize('VG.Roll'),
              callback: html => this._defendDialogCallback(html)
            },
         },
         default: "roll",
         render: (html) => {
          html.find("input[name='defensebasedr']").on("change", this._onDefenseBaseDRChange.bind(this));
          html.find("input[name='defensebasedr']").trigger("change");
        },
         close: () => resolve(null)
        }).render(true);
    });
  }

  _onDefenseBaseDRChange(event) {
    event.preventDefault();
    const baseInput = $(event.currentTarget);
    let drModifier = 0;
    const armor = this.equippedArmor();
    if (armor) {
      // TODO: maxTier is getting stored as a string
      const maxTier = parseInt(armor.data.data.tier.max);
      const defenseModifier = CONFIG.VG.armorTiers[maxTier].defenseModifier;
      if (defenseModifier) { 
        drModifier += defenseModifier;
      }
    }
    if (this.isEncumbered()) {
      drModifier += 2;
    }
    const modifiedDr = parseInt(baseInput[0].value) + drModifier;
    // TODO: this is a fragile way to find the other input field
    const modifiedInput = baseInput.parent().parent().find("input[name='defensemodifieddr']");
    modifiedInput.val(modifiedDr.toString());
  }

  /**
   * Callback from defend dialog.
   */
  async _defendDialogCallback(html) {
    const form = html[0].querySelector("form");
    const baseDR = parseInt(form.defensebasedr.value);
    const modifiedDR = parseInt(form.defensemodifieddr.value);
    const incomingAttack = form.incomingattack.value;
    if (!baseDR || !modifiedDR || !incomingAttack) {
      // TODO: prevent dialog/form submission w/ required field(s)
      return;
    }
    await this.setFlag(CONFIG.VG.flagScope, CONFIG.VG.flags.DEFEND_DR, baseDR);
    await this.setFlag(CONFIG.VG.flagScope, CONFIG.VG.flags.INCOMING_ATTACK, incomingAttack);
    this._rollDefend(modifiedDR, incomingAttack);
  }

  /**
   * Do the actual defend rolls and resolution.
   */
  async _rollDefend(defendDR, incomingAttack) {
    const rollData = this.getRollData();
    const armor = this.equippedArmor();
    const helmet = this.equippedHelmet();

    // roll 1: defend
    let defendRoll = new Roll("d20+@abilities.agility.value", rollData);
    defendRoll.evaluate({async: false});
    await showDice(defendRoll);

    const d20Result = defendRoll.terms[0].results[0].result;
    const isFumble = (d20Result === 1);
    const isCrit = (d20Result === 20);

    let items = [];
    let damageRoll = null;
    let armorRoll = null;
    let defendOutcome = null;
    let takeDamage = null;

    if (isCrit) {
      // critical success
      defendOutcome = game.i18n.localize('VG.DefendCritText');
    } else if (defendRoll.total >= defendDR) {
      // success
      defendOutcome = game.i18n.localize('VG.Dodge');
    } else {
      // failure
      if (isFumble) {
        defendOutcome = game.i18n.localize('VG.DefendFumbleText');
      } else {
        defendOutcome = game.i18n.localize('VG.Hit');
      }

      // roll 2: incoming damage
      let damageFormula = incomingAttack;
      if (isFumble) {
        damageFormula += " * 2";
      }
      damageRoll = new Roll(damageFormula, {});
      damageRoll.evaluate({async: false});
      let dicePromises = [];
      addShowDicePromise(dicePromises, damageRoll);
      let damage = damageRoll.total;

      // roll 3: damage reduction from equipped armor and helmet
      let damageReductionDie = "";
      if (armor) {
        damageReductionDie = CONFIG.VG.armorTiers[armor.data.data.tier.value].damageReductionDie;
        items.push(armor);
      }    
      if (helmet) {
        damageReductionDie += "+1";
        items.push(helmet);
      }
      if (damageReductionDie) {
        armorRoll = new Roll("@die", {die: damageReductionDie});
        armorRoll.evaluate({async: false});
        addShowDicePromise(dicePromises, armorRoll);
        damage = Math.max(damage - armorRoll.total, 0);
      }
      if (dicePromises) {
        await Promise.all(dicePromises);
      }
      takeDamage = `${game.i18n.localize('VG.Take')} ${damage} ${game.i18n.localize('VG.Damage')}`
    }

    const rollResult = {
      actor: this,
      armorRoll,
      damageRoll,
      defendDR,
      defendOutcome,
      defendRoll,
      items,
      takeDamage
    };
    await this._renderDefendRollCard(rollResult);
  }

  /**
   * Show attack rolls/result in a chat roll card.
   */
  async _renderDefendRollCard(rollResult) {
    const html = await renderTemplate(DEFEND_ROLL_CARD_TEMPLATE, rollResult)
    ChatMessage.create({
      content : html,
      sound : diceSound(),
      speaker : ChatMessage.getSpeaker({actor: this}),
    });
  }

  /**
   * Check morale!
   */
  async checkMorale(sheetData) {
    const actorRollData = this.getRollData();
    const moraleRoll = new Roll("2d6", actorRollData);
    moraleRoll.evaluate({async: false});
    await showDice(moraleRoll);

    let outcomeRoll = null;
    if (moraleRoll.total > this.data.data.morale) {
      outcomeRoll = new Roll("1d6", actorRollData);
      outcomeRoll.evaluate({async: false});
      await showDice(outcomeRoll);
    }
    await this._renderMoraleRollCard(moraleRoll, outcomeRoll);
  }

  /**
   * Show morale roll/result in a chat roll card.
   */
  async _renderMoraleRollCard(moraleRoll, outcomeRoll) {
    let outcomeKey = null;
    if (outcomeRoll) {
      outcomeKey = outcomeRoll.total <= 3 ? "VG.MoraleFlees" : "VG.MoraleSurrenders";
    } else {
      outcomeKey = "VG.StandsFirm";
    }
    const outcomeText = game.i18n.localize(outcomeKey);
    const rollResult = {
      actor: this,
      outcomeRoll,
      outcomeText,
      moraleRoll,      
    };
    const html = await renderTemplate(MORALE_ROLL_CARD_TEMPLATE, rollResult)
    ChatMessage.create({
      content : html,
      sound : diceSound(),
      speaker : ChatMessage.getSpeaker({actor: this}),
    });
  }

  /**
   * Check reaction!
   */
  async checkReaction(sheetData) {
    const actorRollData = this.getRollData();
    const reactionRoll = new Roll("2d6", actorRollData);
    reactionRoll.evaluate({async: false});
    await showDice(reactionRoll);
    await this._renderReactionRollCard(reactionRoll);
  }

  /**
   * Show reaction roll/result in a chat roll card.
   */
  async _renderReactionRollCard(reactionRoll) {
    let key = "";
    if (reactionRoll.total <= 3) {
      key = "VG.ReactionKill";
    } else if (reactionRoll.total <= 6) {
      key = "VG.ReactionAngered";
    } else if (reactionRoll.total <= 8) {
      key = "VG.ReactionIndifferent";
    } else if (reactionRoll.total <= 10) {
      key = "VG.ReactionAlmostFriendly";
    } else {
      key = "VG.ReactionHelpful";
    }
    let reactionText = game.i18n.localize(key);
    const rollResult = {
      actor: this,
      reactionRoll,
      reactionText,
    };
    const html = await renderTemplate(REACTION_ROLL_CARD_TEMPLATE, rollResult)
    ChatMessage.create({
      content : html,
      sound : diceSound(),
      speaker : ChatMessage.getSpeaker({actor: this}),
    });
  }

  async activateTribute() {
    if (this.data.data.neuromancyPoints.value < 1) {
      ui.notifications.warn(`${game.i18n.localize('VG.NoNeuromancyPointsRemaining')}!`);
      return;
    }

    const activateRoll = new Roll("d20+@abilities.presence.value", this.getRollData());
    activateRoll.evaluate({async: false});
    await showDice(activateRoll);

    const d20Result = activateRoll.terms[0].results[0].result;
    const isFumble = (d20Result === 1);
    const isCrit = (d20Result === 20);
    const activateDR = 12;

    let wieldOutcome = null;
    let damageRoll = null;
    let takeDamage = null;
    if (activateRoll.total >= activateDR) {
      // SUCCESS!!!
      wieldOutcome = game.i18n.localize(isCrit ? 'VG.CriticalSuccess' : 'VG.Success');
    } else {
      // FAILURE
      wieldOutcome = game.i18n.localize(isFumble ? 'VG.ActivateTributeFumble' : 'VG.Failure');
      damageRoll = new Roll("1d2", this.getRollData());
      damageRoll.evaluate({async: false});
      await showDice(damageRoll);
      takeDamage = `${game.i18n.localize('VG.Take')} ${damageRoll.total} ${game.i18n.localize('VG.Damage')}, ${game.i18n.localize('VG.ActivateTributeDizzy')}`;
    }

    const rollResult = {
      damageRoll,
      activateDR,
      wieldOutcome,
      activateRoll,
      takeDamage,
    };
    const html = await renderTemplate(WIELD_POWER_ROLL_CARD_TEMPLATE, rollResult)
    ChatMessage.create({
      content : html,
      sound : diceSound(),
      speaker : ChatMessage.getSpeaker({actor: this}),
    });

    const newPowerUses = Math.max(0, this.data.data.neuromancyPoints.value - 1);
    return this.update({["data.neuromancyPoints.value"]: newPowerUses});
  }

  async useSkill(itemId) {
    const item = this.items.get(itemId);
    if (!item || !item.data.data.rollLabel || !item.data.data.rollFormula) {
      return;
    }
    await this._rollOutcome(
      item.data.data.rollFormula,
      this.getRollData(),
      item.data.data.rollLabel,
      (roll) => ``);
  }

  async _rollOutcome(dieRoll, rollData, cardTitle, outcomeTextFn) {
    let roll = new Roll(dieRoll, rollData);
    roll.evaluate({async: false});
    await showDice(roll);
    const rollResult = {
      cardTitle: cardTitle,
      outcomeText: outcomeTextFn(roll),
      roll,
    };
    const html = await renderTemplate(OUTCOME_ROLL_CARD_TEMPLATE, rollResult)
    ChatMessage.create({
      content : html,
      sound : diceSound(),
      speaker : ChatMessage.getSpeaker({actor: this}),
    });    
    return roll;
  }

  async rollOmens() {
    const classItem = this.items.filter(x => x.type === "class").pop();
    if (!classItem) {
      return;
    }
    const roll = await this._rollOutcome(
      "@favorDie",
      classItem.getRollData(),
      `${game.i18n.localize('VG.Favors')}`, 
      (roll) => ` ${game.i18n.localize('VG.Favors')}: ${Math.max(0, roll.total)}`);
    const newOmens = Math.max(0, roll.total);
    return this.update({["data.favors"]: {max: newOmens, value: newOmens}});
  }

  async rollNeuromancyPointsPerDay() {
    const roll = await this._rollOutcome(
      "d4+@abilities.presence.value",
      this.getRollData(),
      `${game.i18n.localize('VG.NeuromancyPoints')} ${game.i18n.localize('VG.PerDay')}`, 
      (roll) => ` ${game.i18n.localize('VG.NeuromancyPoints')}: ${Math.max(0, roll.total)}`);
    const newPoints = Math.max(0, roll.total);
    return this.update({["data.neuromancyPoints"]: {max: newPoints, value: newPoints}});
  }

  /**
   * 
   * @param {*} restLength "short" or "long"
   * @param {*} foodAndDrink "eat", "donteat", or "starve"
   * @param {*} infected true/false
   */
  async rest(restLength, foodAndDrink, infected) {
    if (restLength === "short") {
      if (foodAndDrink === "eat" && !infected) {
        await this.rollHealHitPoints("d4");
      } else {
        await this.showRestNoEffect();
      }
    } else if (restLength === "long") {
      let canRestore = true;
      if (foodAndDrink === "starve") {
        await this.rollStarvation();
        canRestore = false;
      }
      if (infected) {
        await this.rollInfection();
        canRestore = false;
      }
      if (canRestore && foodAndDrink === "eat") {
        await this.rollHealHitPoints("d6");
        await this.rollNeuromancyPointsPerDay();
        if (this.data.data.favors.value === 0) {
          await this.rollOmens();
        }
      } else if (canRestore && foodAndDrink === "donteat") {
        await this.showRestNoEffect();
      }
    }
  }

  async showRestNoEffect() {
    const result = {
      cardTitle: game.i18n.localize('VG.Rest'),
      outcomeText: game.i18n.localize('VG.NoEffect'),
    };
    const html = await renderTemplate(OUTCOME_ONLY_ROLL_CARD_TEMPLATE, result);
    await ChatMessage.create({
      content : html,
      sound : diceSound(),
      speaker : ChatMessage.getSpeaker({actor: this}),
    });
  }

  async rollHealHitPoints(dieRoll) {
    const roll = await this._rollOutcome(
      dieRoll,
      this.getRollData(),
      game.i18n.localize('VG.Rest'), 
      (roll) => `${game.i18n.localize('VG.Heal')} ${roll.total} ${game.i18n.localize('VG.HP')}`);
    const newHP = Math.min(this.data.data.hp.max, this.data.data.hp.value + roll.total);
    return this.update({["data.hp.value"]: newHP});
  }

  async rollStarvation() {
    const roll = await this._rollOutcome(
      "d4",
      this.getRollData(),
      game.i18n.localize('VG.Starvation'), 
      (roll) => `${game.i18n.localize('VG.Take')} ${roll.total} ${game.i18n.localize('VG.Damage')}`);
    const newHP = this.data.data.hp.value - roll.total;
    return this.update({["data.hp.value"]: newHP});
  }

  async rollInfection() {
    const roll = await this._rollOutcome(
      "d6",
      this.getRollData(),
      game.i18n.localize('VG.Infection'), 
      (roll) => `${game.i18n.localize('VG.Take')} ${roll.total} ${game.i18n.localize('VG.Damage')}`);
    const newHP = this.data.data.hp.value - roll.total;
    return this.update({["data.hp.value"]: newHP});
  }

  async improve() {
    const oldHp = this.data.data.hp.max;
    const newHp = this._betterHp(oldHp);
    const oldStr = this.data.data.abilities.strength.value;
    const newStr = this._betterAbility(oldStr);
    const oldAgi = this.data.data.abilities.agility.value;
    const newAgi = this._betterAbility(oldAgi);
    const oldPre = this.data.data.abilities.presence.value
    const newPre = this._betterAbility(oldPre);
    const oldTou = this.data.data.abilities.toughness.value;
    const newTou = this._betterAbility(oldTou);

    let hpOutcome = this._abilityOutcome(game.i18n.localize('VG.HP'), oldHp, newHp);
    let strOutcome = this._abilityOutcome(game.i18n.localize('VG.AbilityStrength'), oldStr, newStr);
    let agiOutcome = this._abilityOutcome(game.i18n.localize('VG.AbilityAgility'), oldAgi, newAgi);
    let preOutcome = this._abilityOutcome(game.i18n.localize('VG.AbilityPresence'), oldPre, newPre);
    let touOutcome = this._abilityOutcome(game.i18n.localize('VG.AbilityToughness'), oldTou, newTou);

    // show a single chat message for everything
    const data = {
      agiOutcome,
      hpOutcome,
      preOutcome,
      strOutcome,
      touOutcome,
    };
    const html = await renderTemplate(IMPROVE_ROLL_CARD_TEMPLATE, data);
    ChatMessage.create({
      content : html,
      sound : CONFIG.sounds.dice,  // make a single dice sound
      speaker : ChatMessage.getSpeaker({actor: this}),
    });

    // set new stats on the actor
    return this.update({
      ["data.abilities.strength.value"]: newStr,
      ["data.abilities.agility.value"]: newAgi,
      ["data.abilities.presence.value"]: newPre,
      ["data.abilities.toughness.value"]: newTou,
      ["data.hp.max"]: newHp,
    });
  }

  _betterHp(oldHp) {
    const hpRoll = new Roll("6d10", this.getRollData()).evaluate({async: false});
    if (hpRoll.total >= oldHp) {
      // success, increase HP
      const howMuchRoll = new Roll("1d6", this.getRollData()).evaluate({async: false});
      return oldHp + howMuchRoll.total;
    } else {
      // no soup for you
      return oldHp;
    }
  }

  _betterAbility(oldVal) {
    const roll = new Roll("1d6", this.getRollData()).evaluate({async: false});
    if (roll.total === 1 || roll.total < oldVal) {
      // decrease, to a minimum of -3
      return Math.max(-3, oldVal - 1);
    } else {
      // increase, to a max of +6
      return Math.min(6, oldVal + 1);
    }
  }

  _abilityOutcome(abilityName, oldVal, newVal) {
    if (newVal < oldVal) {
      return `Lose ${oldVal - newVal} ${abilityName}`;
    } else if (newVal > oldVal) {
      return `Gain ${newVal - oldVal} ${abilityName}`;
    } else {
      return `${abilityName} unchanged`;
    }
  }

  async scvmify() {
    new ScvmDialog(this).render(true);
  }

  async rollBroken() {
    const brokenRoll = new Roll("1d4").evaluate({async: false});
    await showDice(brokenRoll);

    let outcomeLines = [];
    let additionalRolls = [];
    if (brokenRoll.total === 1) {
      const unconsciousRoll = new Roll("1d4").evaluate({async: false});
      const s = unconsciousRoll.total > 1 ? "s" : "";
      const hpRoll = new Roll("1d4").evaluate({async: false});
      outcomeLines = [`Fall unconscious`, `for ${unconsciousRoll.total} round${s},`, `awaken with ${hpRoll.total} HP.`];
      additionalRolls = [unconsciousRoll, hpRoll];
    } else if (brokenRoll.total === 2) {
      const limbRoll = new Roll("1d6").evaluate({async: false});
      const actRoll = new Roll("1d4").evaluate({async: false});
      const hpRoll = new Roll("1d4").evaluate({async: false});
      const s = actRoll.total > 1 ? "s" : "";
      if (limbRoll.total <= 5) {
        outcomeLines = [
          "Severed limb,",
          "reduce Agility",
          "permanently by 1.",
          `Can't act for ${actRoll.total} round${s} then become active`, `with ${hpRoll.total} HP.`
        ];
      } else {
        outcomeLines = [
          "Lost eye,",
          "reduce Presence",
          "permanently by 1",
          `Can't act for ${actRoll.total} round${s} then become active with ${hpRoll.total} HP.`
        ];
      }
      additionalRolls = [limbRoll, actRoll, hpRoll];
    } else if (brokenRoll.total === 3) {
      const hemorrhageRoll = new Roll("1d2").evaluate({async: false}); 
      const s = hemorrhageRoll.total > 1 ? "s" : "";
      outcomeLines = [
        `Hemorrhage:`, 
        `dead in ${hemorrhageRoll.total} hour${s}`, `unless treated.`,
        `All tests are DR16`, 
        `the first hour.`
      ];
      if (hemorrhageRoll.total == 2) {
        outcomeLines.push( `DR18 the last hour.`);
      }
      additionalRolls = [hemorrhageRoll];
    } else {
      outcomeLines = [`You are dead.`];
    }

    const data = {
      additionalRolls,
      brokenRoll,
      outcomeLines
    };
    const html = await renderTemplate(BROKEN_ROLL_CARD_TEMPLATE, data);
    ChatMessage.create({
      content : html,
      sound : diceSound(),
      speaker : ChatMessage.getSpeaker({actor: this}),
    });
  }
}  
