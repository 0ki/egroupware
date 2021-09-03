/**
 * EGroupware eTemplate2 - Textbox widget (WebComponent)
 *
 * @license http://opensource.org/licenses/gpl-license.php GPL - GNU General Public License
 * @package etemplate
 * @subpackage api
 * @link https://www.egroupware.org
 * @author Nathan Gray
 */


import {css, html} from "@lion/core";
import {LionTextarea} from "@lion/textarea";
import {Et2InputWidget} from "../Et2InputWidget/Et2InputWidget";
import {Et2Widget} from "../Et2Widget/Et2Widget";


export class Et2Textarea extends Et2InputWidget(LionTextarea)
{
	static get styles()
	{
		return [
			...super.styles,
			css`
			:host {
				display: flex;
				flex-direction: column;
				width: 100%;
				height: 100%;
            }
			`,
		];
	}

	static get properties()
	{
		return {
			...super.properties,
			/**
			 * Specify the width of the text area.
			 * If not set, it will expand to fill the space available.
			 */
			width: {type: String, reflect: true},
			/**
			 * Specify the height of the text area.
			 * If not set, it will expand to fill the space available.
			 */
			height: {type: String, reflect: true},
			onkeypress: Function,
		}
	}

	constructor()
	{
		super();
	}

	connectedCallback()
	{
		super.connectedCallback();
	}

	set width(value)
	{
		if(this._inputNode)
		{
			this._inputNode.style.width = value;
		}
		this.resizeTextarea();
	}

	set height(value)
	{
		if(this._inputNode)
		{
			this._inputNode.style.height = value;
		}
		this.resizeTextarea();
	}
}

// @ts-ignore TypeScript is not recognizing that Et2Textarea is a LitElement
customElements.define("et2-textarea", Et2Textarea);