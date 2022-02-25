import {et2_IInput, et2_IInputNode, et2_ISubmitListener} from "../et2_core_interfaces";
import {Et2Widget} from "../Et2Widget/Et2Widget";
import {css, dedupeMixin, PropertyValues} from "@lion/core";
import {ManualMessage} from "../Validators/ManualMessage";
import {Required} from "../Validators/Required";

/**
 * This mixin will allow any LitElement to become an Et2InputWidget
 *
 * Usage:
 * export class Et2Button extends Et2InputWidget(LitWidget)) {...}
 */

/**
 * Need to define the interface first, to get around TypeScript issues with protected/public
 * This must match the public API for Et2InputWidgetClass
 * @see https://lit.dev/docs/composition/mixins/#typing-the-subclass
 */
export declare class Et2InputWidgetInterface
{
	readOnly : boolean;
	protected value : string | number | Object;

	public set_value(any) : void;

	public get_value() : any;

	public getValue() : any;

	public set_readonly(boolean) : void;

	public isDirty() : boolean;

	public resetDirty() : void;

	public isValid(messages : string[]) : boolean;
}

const Et2InputWidgetMixin = (superclass) =>
{
	class Et2InputWidgetClass extends Et2Widget(superclass) implements et2_IInput, et2_IInputNode, et2_ISubmitListener
	{
		protected _oldValue : string | number | Object;
		protected node : HTMLElement;

		/** WebComponent **/
		static get styles()
		{
			return [
				super.styles,
				css`
				/* Needed so required can show through */
				::slotted(input), input {
					background-color: transparent;
				}`
			];
		}

		static get properties()
		{
			return {
				...super.properties,
				// readOnly is what the property is in Lion, readonly is the attribute
				readOnly: {
					type: Boolean,
					attribute: 'readonly',
					reflect: true,
				},
				// readonly is what is in the templates
				// I put this in here so loadWebComponent finds it when it tries to set it from the template
				readonly: {
					type: Boolean
				},

				required: {
					type: Boolean,
					reflect: true
				},
				onchange: {
					type: Function
				},
			};
		}

		constructor(...args : any[])
		{
			super(...args);
		}

		connectedCallback()
		{
			super.connectedCallback();
			this.node = this.getInputNode();
		}

		/**
		 * A property has changed, and we want to make adjustments to other things
		 * based on that
		 *
		 * @param {import('@lion/core').PropertyValues } changedProperties
		 */
		updated(changedProperties : PropertyValues)
		{
			super.updated(changedProperties);

			// Needed changed, add / remove validator
			if(changedProperties.has('required'))
			{
				// Remove class
				this.classList.remove("et2_required")
				// Remove all existing Required validators (avoids duplicates)
				this.validators = (this.validators || []).filter((validator) => validator instanceof Required)
				if(this.required)
				{
					this.validators.push(new Required());
					this.classList.add("et2_required");
				}
			}
		}

		/**
		 * Change handler calling custom handler set via onchange attribute
		 *
		 * @param _ev
		 * @returns
		 */
		_onChange(_ev : Event) : boolean
		{
			if(typeof super._onChange == "function")
			{
				super._onChange(_ev);
			}
			if(typeof this.onchange == 'function')
			{
				// Make sure function gets a reference to the widget, splice it in as 2. argument if not
				let args = Array.prototype.slice.call(arguments);
				if(args.indexOf(this) == -1)
				{
					args.splice(1, 0, this);
				}

				return this.onchange(...args);
			}

			return true;
		}

		set_value(new_value)
		{
			this.value = new_value;
		}

		get_value()
		{
			return this.getValue();
		}

		set_readonly(new_value)
		{
			this.readonly = this.readOnly = new_value;
		}

		getValue()
		{
			return this.readOnly ? null : this.value;
		}


		isDirty()
		{
			let value = this.getValue();
			if(typeof value !== typeof this._oldValue)
			{
				return true;
			}
			if(this._oldValue === value)
			{
				return false;
			}
			switch(typeof this._oldValue)
			{
				case "object":
					if(Array.isArray(this._oldValue) &&
						this._oldValue.length !== value.length
					)
					{
						return true;
					}
					for(let key in this._oldValue)
					{
						if(this._oldValue[key] !== value[key])
						{
							return true;
						}
					}
					return false;
				default:
					return this._oldValue != value;
			}
		}

		resetDirty()
		{
			this._oldValue = this.getValue();
		}

		/**
		 * Used by etemplate2 to determine if we can submit or not
		 *
		 * @param messages
		 * @returns {boolean}
		 */
		isValid(messages)
		{
			var ok = true;
			debugger;

			// Check for required
			if(this.needed && !this.readonly && !this.disabled &&
				(this.getValue() == null || this.getValue().valueOf() == ''))
			{
				messages.push(this.egw().lang('Field must not be empty !!!'));
				ok = false;
			}
			return ok;
		}

		getInputNode()
		{
			// From LionInput
			return this._inputNode;
		}

		transformAttributes(attrs)
		{
			super.transformAttributes(attrs);

			// Check whether an validation error entry exists
			if(this.id && this.getArrayMgr("validation_errors"))
			{
				let val = this.getArrayMgr("validation_errors").getEntry(this.id);
				if(val)
				{
					this.set_validation_error(val);
				}
			}
		}

		set_validation_error(err : string)
		{
			// ToDo - implement Lion validators properly, most likely by adding to this.validators

			// Need to change interaction state so messages show up
			this.prefilled = true;
			// Add validator
			this.validators.push(new ManualMessage(err));
			// Force a validate - not needed normally, but if you call set_validation_error() manually,
			// it won't show up without validate()
			this.validate();
		}

		/**
		 * Called whenever the template gets submitted. We return false if the widget
		 * is not valid, which cancels the submission.
		 *
		 * @param _values contains the values which will be sent to the server.
		 * 	Listeners may change these values before they get submitted.
		 */
		async submit(_values) : Promise<boolean>
		{
			this.submitted = true;

			// If using Lion validators, run them now
			if(this.validate)
			{
				// Force update now
				this.validate(true);
				await this.validateComplete;

				return (this.hasFeedbackFor || []).indexOf("error") == -1;
			}
			return true;
		}
	}

	return Et2InputWidgetClass;
}
export const Et2InputWidget = dedupeMixin(Et2InputWidgetMixin);