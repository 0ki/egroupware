/**
 * EGroupware eTemplate2 - Account-selection WebComponent
 *
 * @license http://opensource.org/licenses/gpl-license.php GPL - GNU General Public License
 * @package api
 * @link https://www.egroupware.org
 * @author Ralf Becker <rb@egroupware.org>
 */

import {Et2Select} from "./Et2Select";
import {SelectOption} from "./FindSelectOptions";
import {Et2Image} from "../Et2Image/Et2Image";

export type AccountType = 'accounts'|'groups'|'both'|'owngroups';

/**
 * @customElement et2-select-account
 */
export class Et2SelectAccount extends Et2Select
{
	static get properties()
	{
		return {
			...super.properties,
			/**
			 * One of: 'accounts','groups','both','owngroups'
			 */
			accountType: String,
		}
	}

	constructor()
	{
		super();

		// currently only account_selection "Primary group and search" needs the search,
		// all other types have the accounts fully local
		if (this.egw().preference('account_selection', 'common') === 'primary_group')
		{
			this.searchUrl = "EGroupware\\Api\\Etemplate\\Widget\\Taglist::ajax_search";
		}
		else	// always allow local search
		{
			this.search = true;
		}
		this.searchOptions = { type: 'account', account_type: 'accounts' };
		this.__accountType = 'accounts';
	}

	firstUpdated(changedProperties?)
	{
		super.firstUpdated(changedProperties);
		// Due to the different way Et2SelectAccount handles options, we call this explicitly
		this._renderOptions();
	}

	set accountType(type : AccountType)
	{
		this.__accountType = type;
		this.searchOptions.account_type = type;

		super.select_options = this.select_options;
	}

	get accountType() : AccountType
	{
		return this.__accountType;
	}

	/**
	 * Get account info for select options from common client-side account cache
	 */
	get select_options() : Array<SelectOption>
	{
		const type = this.egw().preference('account_selection', 'common');
		if(type === 'none' && typeof this.egw().user('apps').admin === 'undefined')
		{
			return [];
		}
		let select_options : Array<SelectOption> = [...this.__select_options] || [];
		// for primary_group we only display owngroups == own memberships, not other groups
		if (type === 'primary_group' && this.accountType !== 'accounts')
		{
			if (this.accountType === 'both')
			{
				select_options = select_options.concat(this.egw().accounts('accounts'));
			}
			select_options = select_options.concat(this.egw().accounts('owngroups'));
		}
		else
		{
			select_options = select_options.concat(this.egw().accounts(this.accountType));
		}
		// egw.accounts returns value as number, causing the et2-select to not match the option
		select_options.forEach(option =>
		{
			option.value = option.value.toString();
		});
		return select_options.filter((value, index, self) =>
		{
			return self.findIndex(v => v.value === value.value) === index;
		});
	}

	set select_options(new_options : SelectOption[])
	{
		super.select_options = new_options;
	}

	/**
	 * Override the prefix image for tags (multiple=true)
	 * The default is probably fine, but we're being explicit here.
	 * @param item
	 * @returns {TemplateResult<1>}
	 * @protected
	 *
	 */
	protected _createImage(item) : Et2Image
	{
		const image = super._createImage(item);
		image.src = "/egroupware/api/avatar.php?account_id=" + item.value + "&etag=1";
		return image;
	}
}

customElements.define("et2-select-account", Et2SelectAccount);