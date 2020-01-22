/**
 * EGroupware eTemplate2 - JS Widget base class
 *
 * @license http://opensource.org/licenses/gpl-license.php GPL - GNU General Public License
 * @package etemplate
 * @subpackage api
 * @link http://www.egroupware.org
 * @author Andreas Stöckel
 */

/*egw:uses
	/vendor/bower-asset/jquery/dist/jquery.js;
	lib/tooltip;
	et2_core_DOMWidget;
*/

import './et2_core_interfaces';
import './et2_core_common';
import {et2_DOMWidget} from './et2_core_DOMWidget';
import {ClassWithAttributes} from "./et2_core_inheritance";
import {et2_register_widget, et2_widget, WidgetConfig} from "./et2_core_widget";

/**
 * Class which manages the DOM node itself. The simpleWidget class is derrived
 * from et2_DOMWidget and implements the getDOMNode function. A setDOMNode
 * function is provided, which attatches the given node to the DOM if possible.
 *
 * @augments et2_DOMWidget
 */
export class et2_baseWidget extends et2_DOMWidget implements et2_IAligned
{
	static readonly _attributes: any = {
		"statustext": {
			"name": "Tooltip",
			"type": "string",
			"description": "Tooltip which is shown for this element",
			"translate": true
		},
		"statustext_html": {
			"name": "Tooltip is html",
			"type": "boolean",
			"description": "Flag to allow html content in tooltip",
			"default": false
		},
		"align": {
			"name": "Align",
			"type": "string",
			"default": "left",
			"description": "Position of this element in the parent hbox"
		},
		"onclick": {
			"name": "onclick",
			"type": "js",
			"default": et2_no_init,
			"description": "JS code which is executed when the element is clicked."
		}
	};

	align: string = 'left';
	node: HTMLElement = null;
	statustext: string = '';
	private _messageDiv: JQuery = null;
	private _tooltipElem: JQuery = null;
	onclick: any;

	/**
	 * Constructor
	 */
	constructor(_parent, _attrs? : WidgetConfig, _child? : object)
	{
		// Call the inherited constructor
		super(_parent, _attrs, ClassWithAttributes.extendAttributes(et2_DOMWidget._attributes, _child || {}));
	}

	destroy()
	{
		super.destroy();

		this.node = null;
		this._messageDiv = null;
	}

	/**
	 * The setMessage function can be used to attach a small message box to the
	 * widget. This is e.g. used to display validation errors or success messages
	 *
	 * @param _text is the text which should be displayed as a message
	 * @param _type is an css class which is attached to the message box.
	 * 	Currently available are "hint", "success" and "validation_error", defaults
	 * 	to "hint"
	 * @param _floating if true, the object will be in one row with the element,
	 * 	defaults to true
	 * @param _prepend if set, the message is displayed behind the widget node
	 * 	instead of before. Defaults to false.
	 */
	showMessage(_text, _type?, _floating?, _prepend?)
	{
		// Preset the parameters
		if (typeof _type == "undefined")
		{
			_type = "hint";
		}

		if (typeof _floating == "undefined")
		{
			_floating = true;
		}

		if (typeof _prepend == "undefined")
		{
			_prepend = false;
		}

		var surr = this.getSurroundings();

		// Remove the message div from the surroundings before creating a new
		// one
		this.hideMessage(false, true);

		// Create the message div and add it to the "surroundings" manager
		this._messageDiv = jQuery(document.createElement("div"))
			.addClass("message")
			.addClass(_type)
			.addClass(_floating ? "floating" : "")
			.text(_text.valueOf() + "");

		// Decide whether to prepend or append the div
		if (_prepend)
		{
			surr.prependDOMNode(this._messageDiv[0]);
		}
		else
		{
			surr.appendDOMNode(this._messageDiv[0]);
		}

		surr.update();
	}

	/**
	 * The hideMessage function can be used to hide a previously shown message.
	 *
	 * @param _fade if true, the message div will fade out, otherwise the message
	 * 	div is removed immediately. Defaults to true.
	 * @param _noUpdate is used internally to prevent an update of the surroundings
	 * 	manager.
	 */
	hideMessage(_fade? : boolean, _noUpdate? : boolean)
	{
		if (typeof _fade == "undefined")
		{
			_fade = true;
		}

		if (typeof _noUpdate == "undefined")
		{
			_noUpdate = false;
		}

		// Remove the message from the surroundings manager and remove the
		// reference to it
		if (this._messageDiv != null)
		{
			var surr = this.getSurroundings();
			var self = this;
			var messageDiv = this._messageDiv;
			self._messageDiv = null;

			var _done = function() {
				surr.removeDOMNode(messageDiv[0]);

				// Update the surroundings manager
				if (!_noUpdate)
				{
					surr.update();
				}
			};

			// Either fade out or directly call the function which removes the div
			if (_fade)
			{
				messageDiv.fadeOut("fast", _done);
			}
			else
			{
				_done();
			}
		}
	}

	detachFromDOM()
	{
		// Detach this node from the tooltip node
		if (this._tooltipElem)
		{
			this.egw().tooltipUnbind(this._tooltipElem);
			this._tooltipElem = null;
		}

		// Remove the binding to the click handler
		if (this.node)
		{
			jQuery(this.node).unbind("click.et2_baseWidget");
		}

		return super.detachFromDOM();
	}

	attachToDOM()
	{
		let ret = super.attachToDOM();

		// Add the binding for the click handler
		if (this.node)
		{
			jQuery(this.node).bind("click.et2_baseWidget", this, function(e) {
				return e.data.click.call(e.data, e, this);
			});
			if (typeof this.onclick == 'function') jQuery(this.node).addClass('et2_clickable');
		}

		// Update the statustext
		this.set_statustext(this.statustext);

		return ret;
	}

	setDOMNode(_node)
	{
		if (_node != this.node)
		{
			// Deatch the old node from the DOM
			this.detachFromDOM();

			// Set the new DOM-Node
			this.node = _node;

			// Attatch the DOM-Node to the tree
			return this.attachToDOM();
		}

		return false;
	}

	getDOMNode(_sender?: et2_widget)
	{
		return this.node;
	}

	getTooltipElement()
	{
		return this.getDOMNode(this);
	}

	/**
	 * Click handler calling custom handler set via onclick attribute to this.onclick
	 *
	 * @param _ev
	 * @returns
	 */
	click(_ev)
	{
		if(typeof this.onclick == 'function')
		{
			// Make sure function gets a reference to the widget, splice it in as 2. argument if not
			var args = Array.prototype.slice.call(arguments);
			if(args.indexOf(this) == -1) args.splice(1, 0, this);

			return this.onclick.apply(this, args);
		}

		return true;
	}

	set_statustext(_value)
	{
		// Tooltip should not be shown in mobile view
		if (egwIsMobile()) return;
		// Don't execute the code below, if no tooltip will be attached/detached
		if (_value == "" && !this._tooltipElem)
		{
			return;
		}

		// allow statustext to contain multiple translated sub-strings eg: {Firstname}.{Lastname}
		if (_value.indexOf('{') !== -1)
		{
			var egw = this.egw();
			_value = _value.replace(/{([^}]+)}/g, function(str,p1)
			{
				return egw.lang(p1);
			});
		}

		this.statustext = _value;

		//Get the domnode the tooltip should be attached to
		var elem = jQuery(this.getTooltipElement());

		if (elem)
		{
			//If a tooltip is already attached to the element, remove it first
			if (this._tooltipElem)
			{
				this.egw().tooltipUnbind(this._tooltipElem);
				this._tooltipElem = null;
			}

			if (_value && _value != '')
			{
				this.egw().tooltipBind(elem, _value, this.options.statustext_html);
				this._tooltipElem = elem;
			}
		}
	}

	set_align(_value)
	{
		this.align = _value;
	}

	get_align()
	{
		return this.align;
	}
}

/**
 * Simple container object
 */
class et2_container extends et2_baseWidget
{
	/**
	 * Constructor
	 */
	constructor(_parent, _attrs? : WidgetConfig, _child? : object)
	{
		// Call the inherited constructor
		super(_parent, _attrs, ClassWithAttributes.extendAttributes(et2_DOMWidget._attributes, _child || {}));

		this.setDOMNode(document.createElement("div"));
	}

	/**
	 * The destroy function destroys all children of the widget, removes itself
	 * from the parents children list.
	 * Overriden to not try to remove self from parent, as that's not possible.
	 */
	destroy()
	{
		// Call the destructor of all children
		for (var i = this._children.length - 1; i >= 0; i--)
		{
			this._children[i].destroy();
		}

		// Free the array managers if they belong to this widget
		for (var key in this._mgrs)
		{
			if (this._mgrs[key] && this._mgrs[key].owner == this)
			{
				this._mgrs[key].destroy();
			}
		}
	}
}
// Register widget for attributes, but not for any xml tags
et2_register_widget(et2_container, []);

/**
 * Container object for not-yet supported widgets
 *
 * @augments et2_baseWidget
 */
class et2_placeholder extends et2_baseWidget implements et2_IDetachedDOM
{
	/**
	 *  he attrNodes object will hold the DOM nodes which represent the
	 * values of this object
	 */
	attrNodes: {};
	visible: boolean = false;
	placeDiv: JQuery;
	
	/**
	 * Constructor
	 */
	constructor(_parent, _attrs? : WidgetConfig, _child? : object)
	{
		// Call the inherited constructor
		super(_parent, _attrs, ClassWithAttributes.extendAttributes(et2_DOMWidget._attributes, _child || {}));

		this.attrNodes = {};

		// Create the placeholder div
		this.placeDiv = jQuery(document.createElement("span"))
			.addClass("et2_placeholder");

		var headerNode = jQuery(document.createElement("span"))
			.text(this.getType() || "")
			.addClass("et2_caption")
			.appendTo(this.placeDiv);

		var attrsCntr = jQuery(document.createElement("span"))
			.appendTo(this.placeDiv)
			.hide();

		headerNode.click(this, function(e) {
			e.data.visible = !e.data.visible;
			if (e.data.visible)
			{
				attrsCntr.show();
			}
			else
			{
				attrsCntr.hide();
			}
		});

		for (var key in this.options)
		{
			if (typeof this.options[key] != "undefined")
			{
				if (typeof this.attrNodes[key] == "undefined")
				{
					this.attrNodes[key] = jQuery(document.createElement("span"))
						.addClass("et2_attr");
					attrsCntr.append(this.attrNodes[key]);
				}

				this.attrNodes[key].text(key + "=" + this.options[key]);
			}
		}

		this.setDOMNode(this.placeDiv[0]);
	}

	getDetachedAttributes(_attrs)
	{
		_attrs.push("value");
	}

	getDetachedNodes()
	{
		return [this.placeDiv[0]];
	}

	setDetachedAttributes(_nodes, _values)
	{
		this.placeDiv = jQuery(_nodes[0]);
	}
}
// Register widget, but no tags
et2_register_widget(et2_placeholder, []);
