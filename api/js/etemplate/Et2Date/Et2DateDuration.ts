/**
 * EGroupware eTemplate2 - Duration date widget (WebComponent)
 *
 * @license http://opensource.org/licenses/gpl-license.php GPL - GNU General Public License
 * @package etemplate
 * @subpackage api
 * @link https://www.egroupware.org
 * @author Nathan Gray
 */


import {css, html, LitElement} from "@lion/core";
import {Et2InputWidget} from "../Et2InputWidget/Et2InputWidget";
import {sprintf} from "../../egw_action/egw_action_common";
import {dateStyles} from "./DateStyles";
import {cssImage} from "../Et2Widget/Et2Widget";
import {FormControlMixin} from "@lion/form-core";

export interface formatOptions
{
	select_unit : string;
	display_format : string;
	data_format : string;
	hours_per_day : number;
	empty_not_0 : boolean;
	number_format? : string;
};

/**
 * Format a number as a time duration
 *
 * @param {number} value
 * @param {object} options
 * 	set 'timeFormat': "12" to specify a particular format
 * @returns {value: string, unit: string}
 */
export function formatDuration(value : number | string, options : formatOptions) : { value : string, unit : string }
{
	// Handle empty / 0 / no value
	if(value === "" || value == "0" || !value)
	{
		return {value: options.empty_not_0 ? "0" : "", unit: ""};
	}
	// Make sure it's a number now
	value = typeof value == "string" ? parseInt(value) : value;

	if(!options.select_unit)
	{
		let vals = [];
		for(let i = 0; i < options.display_format.length; ++i)
		{
			let unit = options.display_format[i];
			let val = this._unit_from_value(value, unit, i === 0);
			if(unit === 's' || unit === 'm' || unit === 'h' && options.display_format[0] === 'd')
			{
				vals.push(sprintf('%02d', val));
			}
			else
			{
				vals.push(val);
			}
		}
		return {value: vals.join(':'), unit: ''};
	}

	// Put value into minutes for further processing
	switch(options.data_format)
	{
		case 'd':
			value *= options.hours_per_day;
		// fall-through
		case 'h':
			value *= 60;
			break;
		case 's':	// round to full minutes, unless this would give 0, use 1 digit instead
			value = value < 30 ? Math.round(value / 6.0)/10.0 : Math.round(value / 60.0);
			break;
	}

	// Figure out the best unit for display
	let _unit = options.display_format == "d" ? "d" : "h";
	if(options.display_format.indexOf('m') > -1 && value < 60)
	{
		_unit = 'm';
	}
	else if(options.display_format.indexOf('d') > -1 && value >= (60 * options.hours_per_day))
	{
		_unit = 'd';
	}
	let out_value = "" + (_unit == 'm' ? value : (Math.round((value / 60.0 / (_unit == 'd' ? options.hours_per_day : 1)) * 100) / 100));

	if(out_value === '')
	{
		_unit = '';
	}

	// use decimal separator from user prefs
	var format = options.number_format || this.egw().preference('number_format');
	var sep = format ? format[0] : '.';
	if(format && sep && sep != '.')
	{
		out_value = out_value.replace('.', sep);
	}

	return {value: out_value, unit: _unit};
}

/**
 * Display a time duration (eg: 3 days, 6 hours)
 *
 * If not specified, the time is in assumed to be minutes and will be displayed with a calculated unit
 * but this can be specified with the properties.
 */
export class Et2DateDuration extends Et2InputWidget(FormControlMixin(LitElement))
{
	static get styles()
	{
		return [
			...super.styles,
			...dateStyles,
			css`
			.form-field__group-two {
				width: 100%;
			}
			select {
				color: var(--input-text-color);
				border: 1px solid var(--input-border-color);
				flex: 2 1 auto;
				
				-webkit-appearance: none;
				-moz-appearance: none;
				margin: 0;
				background: #fff no-repeat center right;
				background-image: ${cssImage('arrow_down')};
				background-size: 8px auto;
				background-position-x: calc(100% - 8px);
				text-indent: 5px;
			}
			input {
				color: var(--input-text-color);
				padding-top: 4px;
				padding-bottom: 4px;
			    border: 1px solid var(--input-border-color);
				border-right: none;
				flex: 1 1 auto;
				max-width: 4.5em;
			}
			input:last-child {
				border-right: 1px solid var(--input-border-color);
			}
				
            `,
		];
	}

	static get properties()
	{
		return {
			...super.properties,

			/**
			 * Data format
			 *
			 * Units to read/store the data.  'd' = days (float), 'h' = hours (float), 'm' = minutes (int), 's' = seconds (int).
			 */
			data_format: {
				reflect: true,
				type: String
			},
			/**
			 * Display format
			 *
			 * Permitted units for displaying the data.
			 * 'd' = days, 'h' = hours, 'm' = minutes, 's' = seconds.  Use combinations to give a choice.
			 * Default is 'dh' = days or hours with selectbox.
			 */
			display_format: {
				reflect: true,
				type: String
			},

			/**
			 * Select unit or input per unit
			 *
			 * Display a unit-selection for multiple units, or an input field per unit.
			 * Default is true
			 */
			select_unit: {
				type: Boolean
			},

			/**
			 * Percent allowed
			 *
			 * Allows to enter a percentage instead of numbers
			 */
			percent_allowed: {
				type: Boolean
			},

			/**
			 * Hours per day
			 *
			 * Number of hours in a day, used for converting between hours and (working) days.
			 * Default 8
			 */
			hours_per_day: {
				reflect: true,
				type: Number
			},

			/**
			 * 0 or empty
			 *
			 * Should the widget differ between 0 and empty, which get then returned as NULL
			 * Default false, empty is considered as 0
			 */
			empty_not_0: {
				reflect: true,
				type: Boolean
			},

			/**
			 * Short labels
			 *
			 * use d/h/m instead of day/hour/minute
			 */
			short_labels: {
				reflect: true,
				type: Boolean
			},

			/**
			 * Step limit
			 *
			 * Works with the min and max attributes to limit the increments at which a numeric or date-time value can be set.
			 */
			step: {
				type: String
			}
		}
	}

	protected static time_formats = {d: "d", h: "h", m: "m", s: "s"};
	protected _display = {value: "", unit: ""};

	constructor()
	{
		super();

		// Property defaults
		this.data_format = "m";
		this.display_format = "dhm";
		this.select_unit = true;
		this.percent_allowed = false;
		this.hours_per_day = 8;
		this.empty_not_0 = false;
		this.short_labels = false;

		this.formatter = formatDuration;
	}

	get value() : string
	{
		let value = 0;

		if(!this.select_unit)
		{
			for(let i = this._durationNode.length; --i >= 0;)
			{
				value += parseInt(<string>this._durationNode[i].value) * this._unit2seconds(this._durationNode[i].name);
			}
			if(this.data_format !== 's')
			{
				value /= this._unit2seconds(this.data_format);
			}
			return "" + (this.data_format === 'm' ? Math.round(value) : value);
		}

		let val = this._durationNode.length ? this._durationNode[0].value.replace(',', '.') : "";
		if(val === '')
		{
			return this.empty_not_0 ? '' : "0";
		}
		value = parseFloat(val);

		// Put value into minutes for further processing
		switch(this._formatNode && this._formatNode.value ? this._formatNode.value : this.display_format)
		{
			case 'd':
				value *= this.hours_per_day;
			// fall-through
			case 'h':
				value *= 60;
				break;
		}
		// Minutes should be an integer.  Floating point math.
		if(this.data_format !== 's')
		{
			value = Math.round(value);
		}
		switch(this.data_format)
		{
			case 'd':
				value /= this.hours_per_day;
			// fall-through
			case 'h':
				value /= 60.0;
				break;
			case 's':
				value = Math.round(value * 60.0);
				break;
		}

		return "" + value;
	}

	set value(_value)
	{
		this._display = this._convert_to_display(parseFloat(_value));
		this.requestUpdate();
	}

	/**
	 * @return {TemplateResult}
	 * @protected
	 */
	// eslint-disable-next-line class-methods-use-this
	_inputGroupInputTemplate()
	{
		return html`
            <div class="input-group__input">
                <slot name="input">
                    ${this._inputTemplate()}
                    ${this._formatTemplate()}
                </slot>
            </div>
		`;
	}

	/**
	 * Converts the value in data format into value in display format.
	 *
	 * @param _value int/float Data in data format
	 *
	 * @return Object {value: Value in display format, unit: unit for display}
	 */
	protected _convert_to_display(_value)
	{
		if(!this.select_unit)
		{
			let vals = [];
			for(let i = 0; i < this.display_format.length; ++i)
			{
				let unit = this.display_format[i];
				let val = this._unit_from_value(_value, unit, i === 0);
				if(unit === 's' || unit === 'm' || unit === 'h' && this.display_format[0] === 'd')
				{
					vals.push(sprintf('%02d', val));
				}
				else
				{
					vals.push(val);
				}
			}
			return {value: vals.join(':'), unit: ''};
		}
		if(_value)
		{
			// Put value into minutes for further processing
			switch(this.data_format)
			{
				case 'd':
					_value *= this.hours_per_day;
				// fall-through
				case 'h':
					_value *= 60;
					break;
				case 's':
					_value /= 60.0;
					break;
			}
		}

		// Figure out best unit for display
		var _unit = this.display_format == "d" ? "d" : "h";
		if(this.display_format.indexOf('m') > -1 && _value && _value < 60)
		{
			_unit = 'm';
		}
		else if(this.display_format.indexOf('d') > -1 && _value >= 60 * this.hours_per_day)
		{
			_unit = 'd';
		}
		_value = this.empty_not_0 && _value === '' || !this.empty_not_0 && !_value ? '' :
				 (_unit == 'm' ? parseInt(_value) : (Math.round((_value / 60.0 / (_unit == 'd' ? this.hours_per_day : 1)) * 100) / 100));

		if(_value === '')
		{
			_unit = '';
		}

		// use decimal separator from user prefs
		var format = this.egw().preference('number_format');
		var sep = format ? format[0] : '.';
		if(typeof _value == 'string' && format && sep && sep != '.')
		{
			_value = _value.replace('.', sep);
		}

		return {value: _value, unit: _unit};
	}

	private _unit2seconds(_unit)
	{
		switch(_unit)
		{
			case 's':
				return 1;
			case 'm':
				return 60;
			case 'h':
				return 3600;
			case 'd':
				return 3600 * this.hours_per_day;
		}
	}

	private _unit_from_value(_value, _unit, _highest)
	{
		_value *= this._unit2seconds(this.data_format);
		// get value for given _unit
		switch(_unit)
		{
			case 's':
				return _highest ? _value : _value % 60;
			case 'm':
				_value = Math.floor(_value / 60);
				return _highest ? _value : _value % 60;
			case 'h':
				_value = Math.floor(_value / 3600);
				return _highest ? _value : _value % this.options.hours_per_day;
			case 'd':
				return Math.floor(_value / 3600 * this.options.hours_per_day);
		}
	}

	/**
	 * Render the needed number inputs according to select_unit & display_format properties
	 *
	 * @returns {any}
	 * @protected
	 */
	protected _inputTemplate()
	{
		let inputs = [];
		let value = typeof this._display.value === "number" ? this._display.value : (this._display.value.split(":") || []);
		for(let i = this.select_unit ? 1 : this.display_format.length; i > 0; --i)
		{
			let input = {
				name: "",
				title: "",
				value: value,
				min: undefined,
				max: undefined
			};
			if(!this.select_unit)
			{
				input.min = 0;
				input.name = this.display_format[this.display_format.length - i];
				// @ts-ignore - it doesn't like that it may have been an array
				input.value = <string>(value[this.display_format.length - i]);
				switch(this.display_format[this.display_format.length - i])
				{
					case 's':
						input.max = 60;
						input.title = this.egw().lang('Seconds');
						break;
					case 'm':
						input.max = 60;
						input.title = this.egw().lang('Minutes');
						break;
					case 'h':
						input.max = 24;
						input.title = this.egw().lang('Hours');
						break;
					case 'd':
						input.title = this.egw().lang('Days');
						break;
				}
			}
			inputs.push(input);
		}
		return html`${inputs.map((input : any) =>
                html`<input type="number" name=${input.name} min=${input.min} max=${input.max} title=${input.title}
                            value=${input.value}/>`
        )}
		`;
	}

	/**
	 * Generate the format selector according to the select_unit and display_format properties
	 *
	 * @returns {any}
	 * @protected
	 */
	protected _formatTemplate()
	{
		// If no formats or only 1 format, no need for a selector
		if(!this.display_format || this.display_format.length < 1 ||
			(!this.select_unit && this.display_format.length > 1))
		{
			return html``;
		}
		// Get translations
		this.time_formats = this.time_formats || {
			d: this.short_labels ? this.egw().lang("d") : this.egw().lang("Days"),
			h: this.short_labels ? this.egw().lang("h") : this.egw().lang("Hours"),
			m: this.short_labels ? this.egw().lang("m") : this.egw().lang("Minutes"),
			s: this.short_labels ? this.egw().lang("s") : this.egw().lang("Seconds")
		};
		// It would be nice to use an et2-select here, but something goes weird with the styling
		return html`
            <select>
                ${[...this.display_format].map((format : string) =>
                        html`
                            <option value=${format} ?selected=${this._display.unit === format}>
                                ${this.time_formats[format]}
                            </option>`
                )}
            </select>
		`;
	}

	/**
	 * @returns {HTMLInputElement}
	 */
	get _durationNode() : HTMLInputElement[]
	{
		return this.shadowRoot ? this.shadowRoot.querySelectorAll("input") || [] : [];
	}


	/**
	 * @returns {HTMLSelectElement}
	 */
	get _formatNode() : HTMLSelectElement
	{
		return this.shadowRoot ? this.shadowRoot.querySelector("select") : null;
	}
}

// @ts-ignore TypeScript is not recognizing that this is a LitElement
customElements.define("et2-date-duration", Et2DateDuration);