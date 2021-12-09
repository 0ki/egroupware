/**
 * EGroupware eTemplate2 - Box widget
 *
 * @license http://opensource.org/licenses/gpl-license.php GPL - GNU General Public License
 * @package etemplate
 * @subpackage api
 * @link https://www.egroupware.org
 * @author Nathan Gray
 */


import {css, html, LitElement} from "@lion/core";
import {Et2Widget} from "../Et2Widget/Et2Widget";
import {et2_IDetachedDOM} from "../et2_core_interfaces";

export class Et2Box extends Et2Widget(LitElement) implements et2_IDetachedDOM
{
	static get styles()
	{
		return [
			...super.styles,
			css`
            :host {
				display: block;
            }
            :host > div {
            	display: flex;
            	flex-wrap: nowrap;
            	justify-content: flex-start;
            	align-items: stretch;
			}
			/* CSS for child elements */
            ::slotted(*) {
            	margin: 0px 2px;
            	flex: 1 0 auto;
            }
            ::slotted(img) {
            	/* Stop images from growing.  In general we want them to stay */
            	flex-grow: 0;
            }
            ::slotted([align="left"]) {
            	margin-right: auto;
            	order: -1;
            }
            ::slotted([align="right"]) {
            	margin-left: auto;
            	order: 1;
            }
            `,
		];
	}

	render()
	{
		return html`
            <div ${this.id ? html`id="${this.id}"` : ''}>
                <slot></slot>
            </div> `;
	}

	set_label(new_label)
	{
		// Boxes don't have labels
	}

	_createNamespace() : boolean
	{
		return true;
	}

	/**
	 * Code for implementing et2_IDetachedDOM
	 *
	 * Individual widgets are detected and handled by the grid, but the interface is needed for this to happen
	 *
	 * @param {array} _attrs array to add further attributes to
	 */
	getDetachedAttributes(_attrs)
	{
		_attrs.push('data');
	}

	getDetachedNodes()
	{
		return [this.getDOMNode()];
	}

	setDetachedAttributes(_nodes, _values)
	{
		if(_values.data)
		{
			var pairs = _values.data.split(/,/g);
			for(var i = 0; i < pairs.length; ++i)
			{
				var name_value = pairs[i].split(':');
				jQuery(_nodes[0]).attr('data-' + name_value[0], name_value[1]);
			}
		}
	}
}

customElements.define("et2-box", Et2Box);

export class Et2HBox extends Et2Box
{
	static get styles()
	{
		return [
			...super.styles,
			css`
            :host > div {
            	flex-direction: row;
			}`
		];
	}
}

customElements.define("et2-hbox", Et2HBox);

export class Et2VBox extends Et2Box
{
	static get styles()
	{
		return [
			...super.styles,
			css`
            :host > div {
            	flex-direction: column;
						}`
		];
	}
}

customElements.define("et2-vbox", Et2VBox);